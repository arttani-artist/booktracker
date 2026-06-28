// ═══════════════════════════════════════════════════════════════
//  READTRACKER  ·  worms.js  ·  bookworms, graveyard, pixel art
// ═══════════════════════════════════════════════════════════════

const WORM_PARTS = {
  body:   ['#7ecb6e','#e8a87c','#7ab3e0','#b39ddb','#e07070','#f0c060','#88c4a0','#d4a0b8','#80b8c0','#c9a96e','#ff9999','#99ccff'],
  hat:    ['none','🎩','👑','🎓','🪖','🎀','🌸','🍄','🎵','🌈'],
  eyes:   ['◉◉','ʘʘ','••','◕◕','◔◔','^^','@@','◡◡','òó','ᵔᵔ'],
  length: [1,2,3,4,5,6,7],
};

let wormCustom = { color: '#7ecb6e', hat: 'none', eyes: '◉◉', length: 4 };
let editWormCustom = {};

// ── PIXEL EDITOR STATE ────────────────────────────────────────────
let pixelEraserOn = false;
let pixelColor    = '#7ecb6e';
const PIXEL_COLS  = 20, PIXEL_ROWS = 10;
let pixelData     = Array.from({ length: PIXEL_ROWS }, () => Array(PIXEL_COLS).fill(null));
const PIXEL_PALETTE_COLORS = ['#7ecb6e','#e8a87c','#7ab3e0','#b39ddb','#e07070','#f0c060','#88c4a0','#d4a0b8','#80b8c0','#c9a96e','#ffffff','#aaaaaa','#555555','#1a1a1a','#ffaaaa','#aaffaa'];
let pixelEditorInited = false;
let pixelPainting     = false;

// ── HELPERS ───────────────────────────────────────────────────────
function shadeColor(hex, pct) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  r=Math.max(0,Math.min(255,r+pct)); g=Math.max(0,Math.min(255,g+pct)); b=Math.max(0,Math.min(255,b+pct));
  return '#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('');
}

function buildWormSVG(w) {
  const segs=w.length||4, c=w.color||'#7ecb6e', dark=shadeColor(c,-30);
  const segW=18, segH=13, overlap=6, totalW=segs*(segW-overlap)+overlap+20, cx0=14, cy=20;
  let rects='';
  for (let i=segs-1; i>=0; i--) {
    const x=cx0+i*(segW-overlap), fill=i%2===0?c:dark;
    rects += `<ellipse cx="${x}" cy="${cy}" rx="${segW/2}" ry="${segH/2}" fill="${fill}"/>`;
  }
  const eyeStr=w.eyes||'◉◉', hatStr=(w.hat&&w.hat!=='none')?w.hat:'';
  return `<svg viewBox="0 0 ${totalW} 40" xmlns="http://www.w3.org/2000/svg" width="100%" height="44">${rects}
    <text x="${cx0}" y="${cy+5}" text-anchor="middle" font-size="9" fill="rgba(0,0,0,0.6)">${eyeStr}</text>
    ${hatStr?`<text x="${cx0}" y="${cy-segH/2-1}" text-anchor="middle" font-size="12">${hatStr}</text>`:''}
  </svg>`;
}

function pixelDataToImg(pd) {
  const cw=8, ch=8, rects=[];
  for (let r=0; r<PIXEL_ROWS; r++)
    for (let c=0; c<PIXEL_COLS; c++)
      if (pd[r]&&pd[r][c]) rects.push(`<rect x="${c*cw}" y="${r*ch}" width="${cw}" height="${ch}" fill="${pd[r][c]}"/>`);
  return `<svg viewBox="0 0 ${PIXEL_COLS*cw} ${PIXEL_ROWS*ch}" xmlns="http://www.w3.org/2000/svg" style="image-rendering:pixelated">${rects.join('')}</svg>`;
}

// ── INIT / CHECK ──────────────────────────────────────────────────
function initWorms() {
  if (!db.worms) db.worms = { list:[], totalPagesMilestone:0, hunger:0 };
  if (db.worms.hunger == null) db.worms.hunger = 0;
  if (!db.worms.graveyard) db.worms.graveyard = [];
}

function checkWormReward() {
  initWorms();
  const totalPages = db.logs.reduce((s,l) => s+l.pages, 0);
  const newMilestones = Math.floor(totalPages/10);
  const oldMilestones = db.worms.totalPagesMilestone || 0;
  if (newMilestones > oldMilestones) {
    const earned = newMilestones - oldMilestones;
    db.worms.totalPagesMilestone = newMilestones;
    db.worms.hunger = (db.worms.hunger||0) + earned;
    toast(`🐛 +${earned} worm food earned!`);
    save();
    if (document.getElementById('page-worms')?.classList.contains('active')) renderWorms();
  }
}

function checkWormDepletion() {
  initWorms();
  if (!db.worms.list.length) return;
  if (!db.worms.lastDepleteDate) db.worms.lastDepleteDate = todayStr();
  const today = todayStr();
  if (db.worms.lastDepleteDate === today) return;
  const last = new Date(db.worms.lastDepleteDate+'T12:00:00');
  const now  = new Date(today+'T12:00:00');
  const daysMissed = Math.round((now-last)/86400000);
  db.worms.lastDepleteDate = today;
  const toKill = [];
  db.worms.list.forEach(w => {
    w.happiness = Math.max(0, (w.happiness||5) - daysMissed*2);
    if (w.happiness <= 0) toKill.push(w.id);
  });
  save();
  toKill.forEach(id => killWorm(id, 'starvation 💀'));
}

// ── WORM ACTIONS ──────────────────────────────────────────────────
function addWorm() {
  initWorms();
  const eyeEl = document.getElementById('worm-eyes-select');
  if (eyeEl) wormCustom.eyes = eyeEl.value;
  const name = document.getElementById('worm-name').value.trim() || 'wormie';
  db.worms.list.push({ id:Date.now(), name, wormCustom:{...wormCustom}, pixelData:null, happiness:7, timesFed:0, createdDate:todayStr() });
  document.getElementById('worm-name').value = '';
  save(); renderWorms(); toast(`${name} joined your library! 🐛`);
}

function feedWorm(id) {
  initWorms();
  const w = db.worms.list.find(x => x.id===id); if (!w) return;
  if ((db.worms.hunger||0) < 1) { toast('read 10 more pages to earn food! 📚'); return; }
  db.worms.hunger = Math.max(0, (db.worms.hunger||0)-1);
  w.timesFed = (w.timesFed||0)+1;
  w.happiness = Math.min(10, (w.happiness||5)+2);
  save(); renderWorms(); toast(`${w.name} says yum! 🐛`);
}

function deleteWorm(id) {
  if (!confirm('release this worm back into the wild?')) return;
  initWorms();
  db.worms.list = db.worms.list.filter(w => w.id!==id);
  document.querySelector(`.crawl-worm[data-worm-id="${id}"]`)?.remove();
  save(); renderWorms();
}

function killWorm(id, reason) {
  initWorms();
  const w = db.worms.list.find(x => x.id===id); if (!w) return;
  db.worms.graveyard.push({ ...w, diedDate:todayStr(), diedReason:reason||'starvation :(' });
  db.worms.list = db.worms.list.filter(x => x.id!==id);
  document.querySelector(`.crawl-worm[data-worm-id="${id}"]`)?.remove();
  toast(`💀 ${w.name} has perished… rest in peace 🪦`);
  save(); renderWorms();
  if (document.getElementById('page-graveyard')?.classList.contains('active')) renderGraveyard();
}

// ── GRAVEYARD (fixed: no reference to ambiguous el() helper) ──────
function renderGraveyard() {
  initWorms();
  const container = document.getElementById('graveyard-list');
  if (!container) return;
  const dead = db.worms.graveyard || [];
  if (!dead.length) {
    container.innerHTML = '<div class="card"><div class="empty"><div class="empty-icon">🌿</div><p>no worms have died yet, keep feeding them!</p></div></div>';
    return;
  }
  container.innerHTML = dead.slice().reverse().map(w => {
    const wc = w.wormCustom || { color:'#7ecb6e', hat:'none', eyes:'◉◉', length:4 };
    const wormSvg = w.pixelData ? pixelDataToImg(w.pixelData) : buildWormSVG(wc);
    return `<div class="card" style="opacity:0.7;filter:grayscale(0.6)">
      <div style="display:flex;gap:14px;align-items:center">
        <div style="width:80px;flex-shrink:0">${wormSvg}</div>
        <div>
          <div style="font-size:14px;font-weight:500;color:var(--text)">${esc(w.name)}</div>
          <div style="font-size:12px;color:var(--text3)">born ${fmtDate(w.createdDate)} · died ${fmtDate(w.diedDate)}</div>
          <div style="font-size:11px;color:var(--red);margin-top:2px">cause: ${esc(w.diedReason||'unknown')}</div>
          <div style="font-size:11px;color:var(--text3)">fed ${w.timesFed||0}× in their lifetime</div>
        </div>
      </div></div>`;
  }).join('');
}

// ── WORM RENDER & CUSTOMIZER ──────────────────────────────────────
function renderWorms() {
  initWorms();
  const totalPages = db.logs.reduce((s,l) => s+l.pages, 0);
  const todayPages = db.logs.filter(l => l.date===todayStr()).reduce((s,l) => s+l.pages, 0);

  const setTxt = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setTxt('worm-food-count', db.worms.hunger||0);
  setTxt('worm-count', db.worms.list.length);
  setTxt('worm-today-pages', todayPages);
  const subEl = document.getElementById('pixel-unlock-sub');
  if (subEl) subEl.textContent = todayPages>=100 ? '🎨 pixel art unlocked!' : (100-todayPages)+' more to unlock';

  const pixelUnlocked = todayPages >= 100;
  const pixelCard = document.getElementById('pixel-editor-card');
  if (pixelCard) {
    pixelCard.style.display = pixelUnlocked ? 'block' : 'none';
    if (pixelUnlocked) initPixelEditor();
  }

  buildWormCustomizer();
  renderCrawlBar();

  const listEl = document.getElementById('worm-list');
  if (!listEl) return;
  if (!db.worms.list.length) {
    listEl.innerHTML = '<div class="card"><div class="empty"><div class="empty-icon">🐛</div><p>hatch your first bookworm above!</p></div></div>';
    return;
  }
  listEl.innerHTML = db.worms.list.map(w => {
    const hp = Math.min(10, Math.max(0, w.happiness||5)), hpFill = Math.round(hp/10*100);
    const mood = hp>=8?'happy 😊':hp>=5?'content 😐':'hungry 😢';
    const wc  = w.wormCustom || { color:'#7ecb6e', hat:'none', eyes:'◉◉', length:4 };
    const svg = w.pixelData ? pixelDataToImg(w.pixelData) : buildWormSVG(wc);
    return `<div class="worm-card" id="worm-el-${w.id}">
      <div class="worm-svg-display">${svg}</div>
      <div class="worm-info">
        <div class="worm-name-display">${esc(w.name)}</div>
        <div style="font-size:11px;color:var(--text3)">${mood} · fed ${w.timesFed||0}× · since ${fmtDate(w.createdDate)}</div>
        <div style="margin-top:6px">
          <div style="font-size:10px;color:var(--text3);margin-bottom:3px">happiness ${hp}/10</div>
          <div style="height:5px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${hpFill}%;background:${hp>=7?'var(--green)':hp>=4?'var(--accent)':'var(--red)'};border-radius:3px;transition:width .4s"></div>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="btn btn-primary btn-sm" onclick="feedWorm(${w.id})">🍎 feed</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditWorm(${w.id})">✎ edit</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteWorm(${w.id})">release</button>
        </div>
      </div></div>`;
  }).join('');
}

function buildWormCustomizer() {
  const bodyEl = document.getElementById('worm-body-swatches');
  const hatEl  = document.getElementById('worm-hat-swatches');
  const eyeEl  = document.getElementById('worm-eyes-select');
  const lenEl  = document.getElementById('worm-length-swatches');
  if (!bodyEl) return;

  bodyEl.innerHTML = WORM_PARTS.body.map(c =>
    `<div onclick="setWormPart('color','${c}',this)" title="${c}" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c===wormCustom.color?'var(--text)':'transparent'};transition:transform .1s"></div>`
  ).join('');
  hatEl.innerHTML = WORM_PARTS.hat.map(h =>
    `<div onclick="setWormPart('hat','${h}',this)" style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:16px;border:1px solid ${h===wormCustom.hat?'var(--accent)':'var(--border2)'};background:${h===wormCustom.hat?'var(--accent-bg)':'var(--bg3)'}">${h==='none'?'✕ none':h}</div>`
  ).join('');
  eyeEl.innerHTML = WORM_PARTS.eyes.map(e =>
    `<option value="${e}" ${e===wormCustom.eyes?'selected':''}>${e}</option>`
  ).join('');
  eyeEl.onchange = () => { wormCustom.eyes = eyeEl.value; updateWormPreview(); };
  lenEl.innerHTML = WORM_PARTS.length.map(n =>
    `<div onclick="setWormPart('length',${n},this)" style="padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid ${n===wormCustom.length?'var(--accent)':'var(--border2)'};background:${n===wormCustom.length?'var(--accent-bg)':'var(--bg3)'}">${n}</div>`
  ).join('');
  updateWormPreview();
}

function setWormPart(part, val) { wormCustom[part] = val; buildWormCustomizer(); }
function updateWormPreview() {
  const eyeEl = document.getElementById('worm-eyes-select');
  if (eyeEl) wormCustom.eyes = eyeEl.value;
  const el = document.getElementById('worm-preview-svg');
  if (el) el.innerHTML = buildWormSVG(wormCustom);
}

// ── EDIT WORM MODAL ───────────────────────────────────────────────
function openEditWorm(id) {
  const w = db.worms.list.find(x => x.id===id); if (!w) return;
  editWormCustom = w.pixelData ? {} : { ...(w.wormCustom||{color:'#7ecb6e',hat:'none',eyes:'◉◉',length:4}) };
  document.getElementById('edit-worm-id').value   = id;
  document.getElementById('edit-worm-name').value = w.name||'';
  buildEditWormCustomizer();
  document.getElementById('edit-worm-modal').style.display = 'flex';
}
function closeEditWorm() { document.getElementById('edit-worm-modal').style.display='none'; }
function buildEditWormCustomizer() {
  const bodyEl = document.getElementById('edit-worm-body-swatches');
  const hatEl  = document.getElementById('edit-worm-hat-swatches');
  const eyeEl  = document.getElementById('edit-worm-eyes');
  const lenEl  = document.getElementById('edit-worm-length-swatches');
  if (!bodyEl) return;
  bodyEl.innerHTML = WORM_PARTS.body.map(c =>
    `<div onclick="setEditWormPart('color','${c}',this)" style="width:24px;height:24px;border-radius:50%;background:${c};cursor:pointer;border:2px solid ${c===editWormCustom.color?'var(--text)':'transparent'}"></div>`
  ).join('');
  hatEl.innerHTML = WORM_PARTS.hat.map(h =>
    `<div onclick="setEditWormPart('hat','${h}',this)" style="padding:4px 8px;border-radius:6px;cursor:pointer;font-size:16px;border:1px solid ${h===editWormCustom.hat?'var(--accent)':'var(--border2)'};background:${h===editWormCustom.hat?'var(--accent-bg)':'var(--bg3)'}">${h==='none'?'✕ none':h}</div>`
  ).join('');
  eyeEl.innerHTML = WORM_PARTS.eyes.map(e =>
    `<option value="${e}" ${e===editWormCustom.eyes?'selected':''}>${e}</option>`
  ).join('');
  eyeEl.onchange = () => { editWormCustom.eyes=eyeEl.value; updateEditWormPreview(); };
  lenEl.innerHTML = WORM_PARTS.length.map(n =>
    `<div onclick="setEditWormPart('length',${n},this)" style="padding:4px 10px;border-radius:6px;cursor:pointer;font-size:12px;border:1px solid ${n===editWormCustom.length?'var(--accent)':'var(--border2)'};background:${n===editWormCustom.length?'var(--accent-bg)':'var(--bg3)'}">${n}</div>`
  ).join('');
  updateEditWormPreview();
}
function setEditWormPart(part, val) { editWormCustom[part]=val; buildEditWormCustomizer(); }
function updateEditWormPreview() {
  const eyeEl = document.getElementById('edit-worm-eyes');
  if (eyeEl) editWormCustom.eyes = eyeEl.value;
  const el = document.getElementById('edit-worm-preview');
  if (el && editWormCustom.color) el.innerHTML = buildWormSVG(editWormCustom);
}
function saveEditWorm() {
  const id = parseInt(document.getElementById('edit-worm-id').value);
  const w  = db.worms.list.find(x => x.id===id); if (!w) return;
  w.name   = document.getElementById('edit-worm-name').value.trim() || w.name;
  if (editWormCustom.color) { w.wormCustom = {...editWormCustom}; w.pixelData = null; }
  closeEditWorm(); save(); renderWorms(); toast(`${w.name} updated! 🐛`);
}

// ── PIXEL EDITOR ──────────────────────────────────────────────────
function initPixelEditor() {
  if (pixelEditorInited) return;
  pixelEditorInited = true;
  const palette = document.getElementById('pixel-palette'); if (!palette) return;
  palette.innerHTML = PIXEL_PALETTE_COLORS.map(c =>
    `<div class="pixel-swatch${c===pixelColor?' active':''}" style="background:${c}" onclick="setPixelColor('${c}',this)"></div>`
  ).join('');
  drawPixelCanvas();
  setTimeout(setupPixelCanvas, 50);
}
function setPixelColor(c, el) {
  pixelColor = c; pixelEraserOn = false;
  document.querySelectorAll('.pixel-swatch').forEach(s => s.classList.remove('active'));
  if (el) el.classList.add('active');
  const eb = document.getElementById('eraser-btn'); if (eb) eb.style.background = '';
}
function toggleEraser() {
  pixelEraserOn = !pixelEraserOn;
  const btn = document.getElementById('eraser-btn'); if (btn) btn.style.background = pixelEraserOn ? 'var(--accent-bg)' : '';
}
function drawPixelCanvas() {
  const canvas = document.getElementById('pixel-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d'), cw = canvas.width/PIXEL_COLS, ch = canvas.height/PIXEL_ROWS;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = 'rgba(128,128,128,0.15)'; ctx.lineWidth = 0.5;
  for (let c=0; c<=PIXEL_COLS; c++) { ctx.beginPath(); ctx.moveTo(c*cw,0); ctx.lineTo(c*cw,canvas.height); ctx.stroke(); }
  for (let r=0; r<=PIXEL_ROWS; r++) { ctx.beginPath(); ctx.moveTo(0,r*ch); ctx.lineTo(canvas.width,r*ch); ctx.stroke(); }
  for (let row=0; row<PIXEL_ROWS; row++)
    for (let col=0; col<PIXEL_COLS; col++)
      if (pixelData[row]?.[col]) { ctx.fillStyle = pixelData[row][col]; ctx.fillRect(col*cw+0.5,row*ch+0.5,cw-1,ch-1); }
  drawPixelPreview();
}
function drawPixelPreview() {
  const pv = document.getElementById('pixel-preview'); if (!pv) return;
  const ctx = pv.getContext('2d'), cw = pv.width/PIXEL_COLS, ch = pv.height/PIXEL_ROWS;
  ctx.clearRect(0,0,pv.width,pv.height);
  for (let r=0; r<PIXEL_ROWS; r++)
    for (let c=0; c<PIXEL_COLS; c++)
      if (pixelData[r]?.[c]) { ctx.fillStyle = pixelData[r][c]; ctx.fillRect(c*cw,r*ch,cw,ch); }
}
function getPixelRC(e, canvas) {
  const rect = canvas.getBoundingClientRect(), sx = canvas.width/rect.width, sy = canvas.height/rect.height;
  const cx = e.touches?e.touches[0].clientX:e.clientX, cy = e.touches?e.touches[0].clientY:e.clientY;
  return { c:Math.floor((cx-rect.left)*sx/(canvas.width/PIXEL_COLS)), r:Math.floor((cy-rect.top)*sy/(canvas.height/PIXEL_ROWS)) };
}
function setupPixelCanvas() {
  const canvas = document.getElementById('pixel-canvas'); if (!canvas||canvas._setup) return; canvas._setup = true;
  function paint(e) {
    e.preventDefault();
    const p = getPixelRC(e, canvas);
    if (p.r<0||p.r>=PIXEL_ROWS||p.c<0||p.c>=PIXEL_COLS) return;
    pixelData[p.r][p.c] = pixelEraserOn ? null : pixelColor;
    drawPixelCanvas();
  }
  canvas.addEventListener('mousedown', e => { pixelPainting=true; paint(e); });
  canvas.addEventListener('mousemove', e => { if(pixelPainting) paint(e); });
  canvas.addEventListener('mouseup',   () => { pixelPainting=false; });
  canvas.addEventListener('mouseleave',() => { pixelPainting=false; });
  canvas.addEventListener('touchstart',e => { pixelPainting=true; paint(e); }, {passive:false});
  canvas.addEventListener('touchmove', e => { if(pixelPainting) paint(e); }, {passive:false});
  canvas.addEventListener('touchend',  () => { pixelPainting=false; });
}
function clearPixelCanvas() { pixelData=Array.from({length:PIXEL_ROWS},()=>Array(PIXEL_COLS).fill(null)); drawPixelCanvas(); }
function fillPixelCanvas()  { pixelData=Array.from({length:PIXEL_ROWS},()=>Array(PIXEL_COLS).fill(pixelColor)); drawPixelCanvas(); }
function savePixelWorm() {
  initWorms();
  const name = document.getElementById('pixel-worm-name').value.trim() || 'pixel worm';
  if (!pixelData.some(row => row.some(p => p))) { toast('draw something first!'); return; }
  const savedData = pixelData.map(row => row.slice());
  db.worms.list.push({ id:Date.now(), name, wormCustom:null, pixelData:savedData, happiness:10, timesFed:0, createdDate:todayStr() });
  clearPixelCanvas(); document.getElementById('pixel-worm-name').value = '';
  pixelEditorInited = false;
  save(); renderWorms(); toast(`${name} hatched! 🎨🐛`);
}

// ── CRAWL BAR ─────────────────────────────────────────────────────
function toggleCrawlBar() {
  const bar = document.getElementById('worm-crawl-bar');
  const btn = document.getElementById('worm-crawl-toggle');
  if (!bar) return;
  const hidden = bar.dataset.hidden === '1';
  bar.dataset.hidden = hidden ? '0' : '1';
  bar.style.display  = hidden ? '' : 'none';
  if (btn) btn.textContent = hidden ? '🐛 hide worms' : '🐛 show worms';
  prefs.wormsHidden = !hidden;
  savePrefs();
}

function renderCrawlBar() {
  initWorms();
  const bar = document.getElementById('worm-crawl-bar'); if (!bar) return;
  if (prefs.wormsHidden) {
    bar.dataset.hidden = '1'; bar.style.display = 'none';
    const btn = document.getElementById('worm-crawl-toggle'); if (btn) btn.textContent = '🐛 show worms';
  }
  if (bar.dataset.hidden === '1') return;
  if (!db.worms.list.length) { bar.innerHTML = ''; return; }
  const existingIds = new Set(Array.from(bar.querySelectorAll('.crawl-worm')).map(el => +el.dataset.wormId));
  db.worms.list.forEach(w => { if (!existingIds.has(w.id)) spawnWormEl(bar, w); });
  bar.querySelectorAll('.crawl-worm').forEach(el => {
    if (!db.worms.list.find(w => w.id === +el.dataset.wormId)) el.remove();
  });
}

function spawnWormEl(bar, w) {
  const wc  = w.wormCustom || { color:'#7ecb6e', hat:'none', eyes:'◉◉', length:4 };
  const svg = w.pixelData ? pixelDataToImg(w.pixelData) : buildWormSVG(wc);
  const el  = document.createElement('div');
  el.className = 'crawl-worm'; el.dataset.wormId = w.id;
  el.innerHTML = svg; el.title = `${w.name} (drag me!)`;
  const speed=20+Math.random()*25, delay=-(Math.random()*speed), flip=Math.random()>0.5;
  el.style.cssText = `position:absolute;bottom:2px;width:72px;height:36px;transform:scaleX(${flip?-1:1});animation:wormCrawl ${speed}s ${delay}s linear infinite;pointer-events:auto;cursor:grab;`;
  bar.appendChild(el);
  makeCrawlWormDraggable(el);
}

function makeCrawlWormDraggable(el) {
  let dragging=false, startX=0, startLeft=0;
  el.style.pointerEvents='auto'; el.style.cursor='grab';
  const getX = e => e.touches?e.touches[0].clientX:e.clientX;
  el.addEventListener('mousedown', e => { dragging=true; startX=getX(e); startLeft=parseFloat(el.style.left)||0; el.style.animation='none'; el.style.cursor='grabbing'; e.preventDefault(); });
  el.addEventListener('touchstart', e => { dragging=true; startX=getX(e); startLeft=parseFloat(el.style.left)||0; el.style.animation='none'; }, {passive:true});
  window.addEventListener('mousemove', e => { if(!dragging)return; el.style.left=(startLeft+(getX(e)-startX))+'px'; });
  window.addEventListener('touchmove', e => { if(!dragging)return; el.style.left=(startLeft+(getX(e)-startX))+'px'; }, {passive:true});
  const stopDrag = () => {
    if (!dragging) return; dragging=false; el.style.cursor='grab';
    const barW = document.getElementById('worm-crawl-bar')?.offsetWidth || window.innerWidth;
    const curLeft = parseFloat(el.style.left)||0;
    const speed = parseFloat(el.style.animationDuration)||25;
    const timeLeft = Math.max(2, speed * Math.max(0,barW-curLeft) / (barW+80));
    void el.offsetWidth;
    el.style.animation = `wormCrawl ${timeLeft}s 0s linear 1`;
    el.addEventListener('animationend', function onEnd() {
      el.removeEventListener('animationend', onEnd);
      el.style.left='-80px';
      el.style.animation=`wormCrawl ${20+Math.random()*25}s 0s linear infinite`;
    });
  };
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchend', stopDrag);
}
