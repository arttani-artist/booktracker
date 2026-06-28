// ═══════════════════════════════════════════════════════════════
//  READTRACKER  ·  core.js  ·  data, auth, helpers, prefs
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://sfeyjounvjqrsnsjsmtj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xb_HPWpFflrJ-a-eKCW33A_qAwvgNYq';

const SPINE_COLORS  = ['#c9a96e','#5dbf8a','#7ab3e0','#b39ddb','#e07070','#e8a87c','#88c4a0','#d4a0b8','#f0c060','#80b8c0'];
const CHART_COLORS  = ['#c9a96e','#5dbf8a','#7ab3e0','#b39ddb','#e07070','#e8a87c','#88c4a0','#d4a0b8'];

// ── STATE ────────────────────────────────────────────────────────
let sb = null, currentUser = null;
let db = {
  books: [], logs: [], series: [], friends: [], friendReqs: [],
  goal: 24, dailyGoal: 30, weeklyGoal: 200,
  worms: { list: [], totalPagesMilestone: 0, hunger: 0 },
  profile: {}
};
let prefs = { theme: 'dark', accent: 'gold', texture: 'none', density: 'normal', textCase: 'lower' };

// ── SUPABASE ──────────────────────────────────────────────────────
function initSupabase() {
  if (SUPABASE_URL === 'YOUR_SUPABASE_URL') return null;
  try { const { createClient } = supabase; return createClient(SUPABASE_URL, SUPABASE_KEY); }
  catch (e) { console.error(e); return null; }
}

function sbUser() { return currentUser; }

// ── BOOT ──────────────────────────────────────────────────────────
async function boot() {
  sb = initSupabase();
  loadPrefs();
  if (!sb) {
    document.getElementById('supabase-setup-note').style.display = 'block';
    showAuth(); return;
  }
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    try {
      const params = new URLSearchParams(hash.replace('#', '?'));
      const access_token = params.get('access_token');
      const refresh_token = params.get('refresh_token');
      if (access_token) {
        const { data } = await sb.auth.setSession({ access_token, refresh_token });
        if (data?.session) {
          currentUser = data.session.user;
          window.location.hash = '';
          await loadFromCloud(); showApp(); return;
        }
      }
    } catch (e) { console.error('session restore error', e); }
  }
  const { data: { session } } = await sb.auth.getSession();
  if (session) { currentUser = session.user; await loadFromCloud(); showApp(); }
  else showAuth();
}

// ── AUTH ──────────────────────────────────────────────────────────
let authMode = 'signin';

function showAuth() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('app-screen').style.display  = 'none';
}

function showApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display  = 'block';
  if (currentUser) {
    const meta  = currentUser.user_metadata || {};
    const uname = meta.username || currentUser.email.split('@')[0];
    document.getElementById('sidebar-av').textContent    = uname[0].toUpperCase();
    document.getElementById('sidebar-uname').textContent = uname;
    document.getElementById('sidebar-email').textContent = currentUser.email;
    document.getElementById('account-info').textContent  = 'signed in as ' + currentUser.email;
  } else {
    document.getElementById('account-info').textContent = 'offline mode: data saved locally only';
    const so = document.getElementById('signout-btn');
    so.textContent = 'sign in';
    so.onclick = showAuth;
  }
  document.getElementById('log-date').value   = todayStr();
  document.getElementById('dash-date').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  renderAll();
  loadFriends();
  setTimeout(() => { initWorms(); checkWormDepletion(); renderCrawlBar(); }, 200);
}

function toggleAuthMode() {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  document.getElementById('auth-btn').textContent = authMode === 'signin' ? 'sign in' : 'create account';
  document.getElementById('auth-toggle').innerHTML = authMode === 'signin'
    ? 'no account? <a onclick="toggleAuthMode()">sign up</a>'
    : 'have an account? <a onclick="toggleAuthMode()">sign in</a>';
  document.getElementById('auth-mode-sub').textContent = authMode === 'signin'
    ? 'your reading journey, everywhere' : 'join readtracker';
  document.getElementById('auth-username-wrap').style.display = authMode === 'signup' ? 'block' : 'none';
  document.getElementById('auth-err').classList.remove('show');
}

async function doAuth() {
  if (!sb) { continueOffline(); return; }
  const email = document.getElementById('auth-email').value.trim();
  const pw    = document.getElementById('auth-pw').value;
  const errEl = document.getElementById('auth-err');
  errEl.classList.remove('show');
  if (!email || !pw) { errEl.textContent = 'please fill in all fields'; errEl.classList.add('show'); return; }
  document.getElementById('auth-btn').textContent = '…';
  let res;
  if (authMode === 'signin') {
    res = await sb.auth.signInWithPassword({ email, password: pw });
  } else {
    const username = document.getElementById('auth-username').value.trim() || email.split('@')[0];
    res = await sb.auth.signUp({ email, password: pw, options: { data: { username } } });
  }
  document.getElementById('auth-btn').textContent = authMode === 'signin' ? 'sign in' : 'create account';
  if (res.error) { errEl.textContent = res.error.message; errEl.classList.add('show'); return; }
  currentUser = res.data.user;
  if (authMode === 'signup') toast('welcome! check email to verify if needed');
  await loadFromCloud();
  showApp();
}

function continueOffline() { loadLocal(); showApp(); }

async function doSignOut() {
  if (sb) await sb.auth.signOut();
  currentUser = null;
  db = { books: [], logs: [], series: [], friends: [], friendReqs: [], goal: 24, dailyGoal: 30, weeklyGoal: 200, worms: { list: [], totalPagesMilestone: 0, hunger: 0 }, profile: {} };
  showAuth();
}

// ── DATA PERSISTENCE ──────────────────────────────────────────────
function loadLocal() {
  try { const d = localStorage.getItem('rt_db'); if (d) db = { ...db, ...JSON.parse(d) }; } catch (e) {}
}
function saveLocal() {
  try { localStorage.setItem('rt_db', JSON.stringify(db)); } catch (e) {}
}
async function loadFromCloud() {
  if (!sb || !currentUser) { loadLocal(); return; }
  try {
    const { data } = await sb.from('userdata').select('data').eq('user_id', currentUser.id).single();
    if (data?.data) db = { ...db, ...data.data };
    else loadLocal();
  } catch (e) { loadLocal(); }
}
async function save() {
  saveLocal();
  if (!sb || !currentUser) return;
  try {
    await sb.from('userdata').upsert(
      { user_id: currentUser.id, data: db, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
  } catch (e) {}
}

// ── PREFS ────────────────────────────────────────────────────────
function loadPrefs() {
  try { const p = localStorage.getItem('rt_prefs'); if (p) prefs = { ...prefs, ...JSON.parse(p) }; } catch (e) {}
  applyPrefs();
}
function savePrefs() {
  try { localStorage.setItem('rt_prefs', JSON.stringify(prefs)); } catch (e) {}
}
function applyPrefs() {
  const h = document.documentElement;
  h.setAttribute('data-theme',   prefs.theme);
  h.setAttribute('data-accent',  prefs.accent);
  h.setAttribute('data-density', prefs.density);
  h.setAttribute('data-case',    prefs.textCase);
  if (prefs.theme === 'custom' && prefs.customTheme) {
    applyCustomThemeCSSVars(prefs.customTheme);
  } else {
    const s = document.getElementById('custom-theme-style');
    if (s) s.textContent = '';
  }
  const accentRGBs = { gold: '201,169,110', rose: '232,160,176', sage: '136,196,160', sky: '122,184,232', lavender: '176,160,224', coral: '232,144,112' };
  const rgb = accentRGBs[prefs.accent] || '201,169,110';
  const textures = {
    none:  '',
    paper: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E")`,
    dots:  `radial-gradient(circle, rgba(${rgb},0.18) 1px, transparent 1px)`,
    lines: `repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(${rgb},0.09) 39px, rgba(${rgb},0.09) 40px)`,
    grid:  `linear-gradient(rgba(${rgb},0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(${rgb},0.07) 1px, transparent 1px)`,
  };
  const sizes = { none: '', paper: '200px 200px', dots: '24px 24px', lines: '', grid: '32px 32px' };
  document.body.style.backgroundImage = textures[prefs.texture] || '';
  document.body.style.backgroundSize  = sizes[prefs.texture]  || '';
}

function setTheme(t, el)   { prefs.theme = t;        savePrefs(); applyPrefs(); document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === t)); }
function setAccent(a, el)  { prefs.accent = a;       savePrefs(); applyPrefs(); document.querySelectorAll('#accent-swatches .swatch').forEach(s => s.classList.toggle('active', s.dataset.accent === a)); }
function setTexture(t, el) { prefs.texture = t;      savePrefs(); applyPrefs(); document.querySelectorAll('#texture-btns .btn').forEach(b => b.classList.toggle('active-texture', b.textContent.trim() === t)); }
function setDensity(d, el) { prefs.density = d;      savePrefs(); applyPrefs(); document.querySelectorAll('#density-btns .btn').forEach(b => b.classList.toggle('active-density', b.textContent.trim() === d)); }
function setCase(c, el)    { prefs.textCase = c;     savePrefs(); applyPrefs(); document.querySelectorAll('#case-btns .btn').forEach(b => b.classList.remove('active-case')); if (el) el.classList.add('active-case'); }

// custom theme helpers
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `${r},${g},${b}`;
}
function lighten(hex, amt) {
  return '#' + [hex.slice(1,3),hex.slice(3,5),hex.slice(5,7)]
    .map(h => Math.min(255, Math.max(0, parseInt(h,16)+amt)).toString(16).padStart(2,'0')).join('');
}
function darken(hex, amt) { return lighten(hex, -amt); }

function previewCustomTheme() {
  const bg = document.getElementById('custom-bg').value;
  const text = document.getElementById('custom-text').value;
  const accent = document.getElementById('custom-accent').value;
  ['custom-bg-hex','custom-text-hex','custom-accent-hex'].forEach((id,i) => {
    document.getElementById(id).textContent = [bg,text,accent][i];
  });
  const prev = document.getElementById('custom-theme-preview');
  if (prev) {
    prev.style.background = bg;
    prev.style.borderColor = accent + '44';
    document.getElementById('prev-title').style.color = accent;
    document.getElementById('prev-bar').style.background = accent;
    document.getElementById('prev-sub').style.color = text;
  }
}
function applyCustomTheme() {
  const bg = document.getElementById('custom-bg').value;
  const text = document.getElementById('custom-text').value;
  const accent = document.getElementById('custom-accent').value;
  prefs.customTheme = { bg, text, accent };
  prefs.theme = 'custom';
  savePrefs(); applyPrefs();
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
  toast('🎨 custom theme live!');
}
function resetCustomTheme() {
  prefs.theme = 'dark'; delete prefs.customTheme;
  savePrefs(); applyPrefs();
  syncCustomThemePickers();
  document.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('active', s.dataset.theme === 'dark'));
  toast('theme reset');
}
function applyCustomThemeCSSVars(ct) {
  let style = document.getElementById('custom-theme-style');
  if (!style) { style = document.createElement('style'); style.id = 'custom-theme-style'; document.head.appendChild(style); }
  const { bg, text, accent } = ct;
  const rgb = hexToRgb(accent);
  style.textContent = `:root, [data-theme="custom"] {
    --bg:${bg};--bg2:${lighten(bg,8)};--bg3:${lighten(bg,16)};--bg4:${lighten(bg,24)};
    --text:${text};--text2:${darken(text,40)};--text3:${darken(text,80)};
    --border:rgba(${hexToRgb(text)},0.07);--border2:rgba(${hexToRgb(text)},0.13);
    --accent:${accent};--accent2:${lighten(accent,24)};--accent-bg:rgba(${rgb},0.12);--accent-rgb:${rgb};
    --green:#5dbf8a;--green-bg:rgba(93,191,138,0.1);--red:#e07070;--red-bg:rgba(224,112,112,0.08);
    --blue:#7ab3e0;--blue-bg:rgba(122,179,224,0.1);--shadow:rgba(0,0,0,0.4);
  }`;
}
function syncCustomThemePickers() {
  const ct = prefs.customTheme || { bg: '#0d0b09', text: '#ede8e1', accent: '#c9a96e' };
  const ids = ['custom-bg','custom-text','custom-accent'];
  const vals = [ct.bg, ct.text, ct.accent];
  ids.forEach((id, i) => {
    const el = document.getElementById(id); if (!el) return;
    el.value = vals[i];
    const hexEl = document.getElementById(id + '-hex'); if (hexEl) hexEl.textContent = vals[i];
  });
  previewCustomTheme();
}

// ── HELPERS ───────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}
function fmtDate(s) {
  if (!s) return '';
  const [y,m,d] = s.split('-');
  return `${m}/${d}/${y}`;
}
function esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2600);
}
function starsFixed(n) {
  return [1,2,3,4,5].map(i => `<span style="color:${i<=n?'var(--accent)':'var(--text3)'}">★</span>`).join('');
}
function destroyChart(id) {
  if (window._charts && window._charts[id]) { window._charts[id].destroy(); delete window._charts[id]; }
}
function mkChart(id, config) {
  if (!window._charts) window._charts = {};
  destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return;
  window._charts[id] = new Chart(canvas, config);
}
function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#c9a96e';
}
function buildSwatches(containerId, onPickFn) {
  const el = document.getElementById(containerId); if (!el) return;
  el.innerHTML = SPINE_COLORS.map(c =>
    `<div class="swatch" style="background:${c};width:20px;height:20px" onclick="(${onPickFn})('${c}',this)"></div>`
  ).join('');
}

// ── CALC HELPERS ──────────────────────────────────────────────────
function calcStreak() {
  const days = new Set(db.logs.map(l => l.date));
  let s = 0; const d = new Date();
  for (let i = 0; i < 365; i++) {
    const k = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    if (days.has(k)) { s++; d.setDate(d.getDate()-1); }
    else if (i === 0) { d.setDate(d.getDate()-1); }
    else break;
  }
  return s;
}
function pagesInDays(n) {
  const c = new Date(); c.setDate(c.getDate()-n);
  return db.logs.filter(l => new Date(l.date+'T12:00:00') >= c).reduce((s,l) => s+l.pages, 0);
}
function pagesInRange(from, to) {
  const now = new Date();
  const a = new Date(now); a.setDate(now.getDate()-from);
  const b = new Date(now); b.setDate(now.getDate()-to);
  return db.logs.filter(l => { const d = new Date(l.date+'T12:00:00'); return d>=a && d<b; }).reduce((s,l) => s+l.pages, 0);
}
function calcSpeed() {
  const p = db.logs.reduce((s,l) => s+l.pages, 0);
  const m = db.logs.reduce((s,l) => s+l.minutes, 0);
  return m > 0 ? Math.round(p / (m/60)) : 0;
}
function calcAvgDays() {
  const books = db.books.filter(b => b.status==='done' && b.startDate && b.finishedDate);
  if (!books.length) return 0;
  const avg = books.reduce((s,b) => s + Math.max(1,(new Date(b.finishedDate)-new Date(b.startDate))/86400000), 0) / books.length;
  return Math.round(avg);
}
function timeAgo(ts) {
  const diff = Date.now()-ts, m = Math.floor(diff/60000), h = Math.floor(m/60), d = Math.floor(h/24);
  if (d>0) return d+'d ago';
  if (h>0) return h+'h ago';
  if (m>0) return m+'m ago';
  return 'just now';
}
