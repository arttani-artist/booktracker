// ═══════════════════════════════════════════════════════════════
//  READTRACKER  ·  library.js  ·  books, log, series, dashboard
// ═══════════════════════════════════════════════════════════════

let libTabCurrent = 'reading';
let colorModalTarget = null;
let charts = {};

function renderAll() {
  renderDashboard();
  renderLibrary();
  renderLogPage();
  renderGoals();
  renderShare();
}

// ── DASHBOARD ─────────────────────────────────────────────────────
function renderDashboard() {
  const streak = calcStreak(), pw = pagesInDays(7), pl = pagesInRange(14,7);
  const diff = pw - pl, done = db.books.filter(b => b.status==='done').length, spd = calcSpeed();
  document.getElementById('dash-metrics').innerHTML = [
    `<div class="metric hi"><div class="metric-label">streak</div><div class="metric-val">${streak}</div><div class="metric-sub">days 🔥</div></div>`,
    `<div class="metric"><div class="metric-label">pages / week</div><div class="metric-val">${pw.toLocaleString()}</div><div class="metric-sub">${diff===0?'same':(diff>0?'+':'')+diff} vs last wk</div></div>`,
    `<div class="metric"><div class="metric-label">books done</div><div class="metric-val">${done}</div><div class="metric-sub">of ${db.goal} goal</div></div>`,
    `<div class="metric"><div class="metric-label">avg speed</div><div class="metric-val">${spd||'—'}</div><div class="metric-sub">pages/hr</div></div>`,
  ].join('');

  const reading = db.books.filter(b => b.status==='reading');
  document.getElementById('dash-reading').innerHTML = reading.length
    ? reading.map(b => {
        const pct = b.pages ? Math.round((b.pagesRead||0)/b.pages*100) : 0;
        return `<div class="book-item">
          <div class="book-spine" style="background:${b.color}" onclick="openColorModal(${b.id})"></div>
          <div class="book-meta">
            <div class="book-title-t">${esc(b.title)}</div>
            <div class="book-author-t">${esc(b.author)}</div>
            ${b.pages ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${b.color}"></div></div>
            <div style="font-size:10px;color:var(--text3);margin-top:3px">${b.pagesRead||0}/${b.pages} · ${pct}%</div>` : ''}
          </div></div>`;
      }).join('')
    : '<div class="empty"><p>no books in progress</p></div>';

  renderWeekChart();
  renderStreakCal();
}

function renderWeekChart() {
  const labels = [], data = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    labels.push(['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]);
    data.push(db.logs.filter(l => l.date===s).reduce((s,l) => s+l.pages, 0));
  }
  mkChart('week-chart', {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: accentColor()+'cc', borderRadius: 4 }] },
    options: { responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}},
      scales: { x:{grid:{display:false},ticks:{color:'#6b6259',font:{size:10}}}, y:{grid:{color:'rgba(128,128,128,0.08)'},ticks:{color:'#6b6259',font:{size:10},maxTicksLimit:4}} } }
  });
}

function renderStreakCal() {
  const days = new Set(db.logs.map(l => l.date));
  const acc = accentColor();
  let html = '';
  for (let i = 34; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    html += `<div class="s-dot" style="background:${days.has(s)?acc:'rgba(128,128,128,0.1)'}" title="${fmtDate(s)}"></div>`;
  }
  document.getElementById('streak-cal').innerHTML = html;
}

// ── LIBRARY ───────────────────────────────────────────────────────
function libTab(t, el) {
  libTabCurrent = t;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  renderLibrary();
}

function renderLibrary() {
  // sync log book select
  const sel = document.getElementById('log-book'), prev = sel.value;
  sel.innerHTML = '<option value="">select a book…</option>';
  db.books.forEach(b => {
    const o = document.createElement('option');
    o.value = b.id; o.textContent = b.title + (b.status==='done' ? ' ✓' : '');
    sel.appendChild(o);
  });
  if (prev) sel.value = prev;

  let books = [...db.books];
  if (libTabCurrent !== 'all') books = books.filter(b => b.status === libTabCurrent);
  const sortBy = document.getElementById('lib-sort')?.value || 'added';
  books.sort((a,b) => {
    if (sortBy==='title')    return a.title.localeCompare(b.title);
    if (sortBy==='author')   return (a.author||'').localeCompare(b.author||'');
    if (sortBy==='rating')   return (b.rating||0)-(a.rating||0);
    if (sortBy==='pages')    return (b.pages||0)-(a.pages||0);
    if (sortBy==='progress') return ((b.pagesRead||0)/(b.pages||1))-((a.pagesRead||0)/(a.pages||1));
    return b.id - a.id;
  });

  const el = document.getElementById('lib-list');
  if (!books.length) { el.innerHTML = '<div class="card"><div class="empty"><p>nothing here yet</p></div></div>'; return; }

  // group by series
  const grouped = {};
  books.forEach(b => { const k = b.series||'__none__'; if (!grouped[k]) grouped[k]=[]; grouped[k].push(b); });

  let html = '<div class="card"><div class="book-list">';
  Object.entries(grouped).forEach(([serKey, grp]) => {
    if (serKey !== '__none__') html += `<div class="series-group-header">📚 ${esc(serKey)}</div>`;
    grp.forEach(b => {
      const pct = b.pages ? Math.round((b.pagesRead||0)/b.pages*100) : 0;
      const stars = [1,2,3,4,5].map(i =>
        `<span class="star ${i<=(b.rating||0)?'on':''}" onclick="setRating(event,${b.id},${i})">★</span>`).join('');
      html += `<div class="book-item">
        <div class="book-spine" style="background:${b.color}" onclick="openColorModal(${b.id})" title="click to change colour"></div>
        <div class="book-meta">
          <div class="book-title-t">${esc(b.title)}</div>
          <div class="book-author-t">${esc(b.author)}</div>
          <div class="book-tags">
            <span class="pill pill-${b.status}">${b.status==='reading'?'reading':b.status==='want'?'want to read':'finished'}</span>
            ${b.genre ? `<span class="pill pill-genre">${esc(b.genre)}</span>` : ''}
            ${b.series ? `<span class="series-badge">◧ ${esc(b.series)}${b.seriesNum?' #'+b.seriesNum:''}</span>` : ''}
            ${b.pages ? `<span style="font-size:10px;color:var(--text3)">${b.pages}p</span>` : ''}
            ${b.finishedDate ? `<span style="font-size:10px;color:var(--text3)">done ${fmtDate(b.finishedDate)}</span>` : ''}
          </div>
          ${b.status==='reading'&&b.pages ? `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${b.color}"></div></div>` : ''}
          <div style="margin-top:4px">${stars}</div>
        </div>
        <div class="book-actions">
          <button class="btn-icon" title="edit" onclick="openEditBook(${b.id})" style="font-size:13px">✎</button>
          <button class="btn-icon" onclick="deleteBook(${b.id})">×</button>
        </div></div>`;
    });
  });
  html += '</div></div>';
  el.innerHTML = html;
}

// ── ADD / EDIT / DELETE BOOK ──────────────────────────────────────
function addBook() {
  const title = document.getElementById('b-title').value.trim();
  if (!title) { toast('please enter a title'); return; }
  const status = document.getElementById('b-status').value;
  const pages  = parseInt(document.getElementById('b-pages').value) || 0;
  const seriesName = document.getElementById('b-series').value.trim();
  const color  = document.getElementById('b-color').value || SPINE_COLORS[db.books.length % SPINE_COLORS.length];

  if (seriesName && !db.series.find(s => s.name.toLowerCase()===seriesName.toLowerCase()))
    db.series.push({ id:Date.now(), name:seriesName, author:document.getElementById('b-author').value.trim(), genre:document.getElementById('b-genre').value.trim(), total:0 });

  db.books.push({
    id:Date.now(), title, author:document.getElementById('b-author').value.trim(), pages,
    genre:document.getElementById('b-genre').value.trim(), series:seriesName,
    seriesNum:parseInt(document.getElementById('b-series-num').value)||0,
    status, color, rating:parseInt(document.getElementById('b-rating').value)||0,
    pagesRead:status==='done'?pages:0,
    startDate:document.getElementById('b-start').value||(status!=='want'?todayStr():''),
    finishedDate:status==='done'?todayStr():'', addedDate:todayStr()
  });

  ['b-title','b-author','b-pages','b-genre','b-series','b-series-num','b-start'].forEach(id => document.getElementById(id).value='');
  document.getElementById('b-status').value='reading';
  document.getElementById('b-rating').value='0';
  document.getElementById('b-color').value='#c9a96e';
  save(); renderAll(); toast('book added!');
}

function deleteBook(id) {
  if (!confirm('remove this book and its sessions?')) return;
  db.books = db.books.filter(b => b.id !== id);
  db.logs  = db.logs.filter(l => l.bookId !== id);
  save(); renderAll(); toast('removed');
}

function setRating(e, bookId, r) {
  e.stopPropagation();
  const b = db.books.find(x => x.id===bookId);
  if (b) { b.rating = r; save(); renderLibrary(); }
}

// ── SPINE COLOR MODAL ─────────────────────────────────────────────
function openColorModal(bookId) {
  colorModalTarget = bookId;
  const book = db.books.find(b => b.id===bookId);
  if (book) document.getElementById('modal-color-picker').value = book.color || '#c9a96e';
  buildSwatches('modal-swatches', (c) => `document.getElementById('modal-color-picker').value='${c}'`);
  document.getElementById('color-modal').style.display = 'flex';
}
function closeColorModal() { document.getElementById('color-modal').style.display='none'; colorModalTarget=null; }
function applySpineColor() {
  const c = document.getElementById('modal-color-picker').value;
  if (colorModalTarget) { const b = db.books.find(x => x.id===colorModalTarget); if (b) { b.color=c; save(); renderLibrary(); } }
  closeColorModal();
}

// ── EDIT BOOK MODAL ───────────────────────────────────────────────
function setSelectOrAdd(selId, val) {
  const sel = document.getElementById(selId); if (!sel) return;
  let found = false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value.toLowerCase() === val.toLowerCase()) { sel.value = sel.options[i].value; found = true; break; }
  }
  if (!found && val) {
    const opt = document.createElement('option'); opt.value = val; opt.textContent = val;
    sel.appendChild(opt); sel.value = val;
  } else if (!found) { sel.value = ''; }
}

function openEditBook(id) {
  const b = db.books.find(x => x.id===id); if (!b) return;
  document.getElementById('edit-book-id').value     = id;
  document.getElementById('edit-b-title').value     = b.title||'';
  document.getElementById('edit-b-author').value    = b.author||'';
  document.getElementById('edit-b-pages').value     = b.pages||'';
  document.getElementById('edit-b-pagesread').value = b.pagesRead||'';
  const genreParts = (b.genre||'').split('/').map(s => s.trim());
  setSelectOrAdd('edit-b-genre', genreParts[0]||'');
  setSelectOrAdd('edit-b-genre2', genreParts[1]||'');
  document.getElementById('edit-b-series').value    = b.series||'';
  document.getElementById('edit-b-seriesnum').value = b.seriesNum||'';
  document.getElementById('edit-b-status').value    = b.status||'want';
  document.getElementById('edit-b-rating').value    = b.rating||0;
  document.getElementById('edit-b-start').value     = b.startDate||'';
  document.getElementById('edit-b-finished').value  = b.finishedDate||'';
  document.getElementById('edit-b-color').value     = b.color||'#c9a96e';
  buildSwatches('edit-quick-swatches', (c) => `document.getElementById('edit-b-color').value='${c}'`);
  document.getElementById('edit-book-modal').style.display = 'flex';
}
function closeEditBook() { document.getElementById('edit-book-modal').style.display='none'; }
function saveEditBook() {
  const id = parseInt(document.getElementById('edit-book-id').value);
  const b  = db.books.find(x => x.id===id); if (!b) return;
  b.title       = document.getElementById('edit-b-title').value.trim() || b.title;
  b.author      = document.getElementById('edit-b-author').value.trim();
  b.pages       = parseInt(document.getElementById('edit-b-pages').value) || b.pages;
  b.pagesRead   = Math.min(parseInt(document.getElementById('edit-b-pagesread').value)||b.pagesRead, b.pages||99999);
  const g1 = document.getElementById('edit-b-genre').value.trim();
  const g2 = document.getElementById('edit-b-genre2').value.trim();
  b.genre       = g2 ? g1 + ' / ' + g2 : g1;
  b.series      = document.getElementById('edit-b-series').value.trim();
  b.seriesNum   = parseInt(document.getElementById('edit-b-seriesnum').value)||0;
  b.status      = document.getElementById('edit-b-status').value;
  b.rating      = parseInt(document.getElementById('edit-b-rating').value)||0;
  b.startDate   = document.getElementById('edit-b-start').value;
  b.finishedDate= document.getElementById('edit-b-finished').value;
  b.color       = document.getElementById('edit-b-color').value;
  closeEditBook();
  save(); renderAll(); toast('book updated!');
}

// ── LOG SESSION ───────────────────────────────────────────────────
function logSession() {
  const bid   = parseInt(document.getElementById('log-book').value);
  const pages = parseInt(document.getElementById('log-pages').value)||0;
  if (!bid || !pages) { toast('select a book and enter pages'); return; }
  const mins   = parseInt(document.getElementById('log-mins').value)||0;
  const date   = document.getElementById('log-date').value || todayStr();
  const finish = document.getElementById('log-finish').value === 'yes';
  const notes  = document.getElementById('log-notes').value.trim();
  db.logs.push({ id:Date.now(), bookId:bid, pages, minutes:mins, date, notes });
  const book = db.books.find(b => b.id===bid);
  if (book) {
    book.pagesRead = Math.min((book.pagesRead||0)+pages, book.pages||99999);
    if (finish || (book.pages && book.pagesRead>=book.pages)) {
      book.status='done'; book.finishedDate=date; toast('🎉 book finished!');
    } else toast('session saved!');
  }
  ['log-pages','log-mins','log-notes'].forEach(i => document.getElementById(i).value='');
  document.getElementById('log-finish').value='no';
  save(); renderAll(); checkWormReward();
}

function renderLogPage() {
  const sorted = [...db.logs].sort((a,b) => b.date.localeCompare(a.date)).slice(0,20);
  const el = document.getElementById('log-recent');
  if (!sorted.length) { el.innerHTML='<div class="empty"><p>no sessions yet</p></div>'; return; }
  el.innerHTML = sorted.map(l => {
    const b = db.books.find(x => x.id===l.bookId);
    return `<div class="log-item">
      <div class="log-dot" style="background:${b?b.color:'var(--accent)'}"></div>
      <div class="log-body">
        <div class="log-book">${esc(b?b.title:'unknown')}</div>
        <div class="log-info">${l.pages} pages${l.minutes?' · '+l.minutes+' min':''}</div>
        ${l.notes ? `<div class="log-note">${esc(l.notes.slice(0,80))}</div>` : ''}
      </div>
      <div class="log-right">${fmtDate(l.date)}</div></div>`;
  }).join('');
}

// ── SERIES ────────────────────────────────────────────────────────
function addSeries() {
  const name = document.getElementById('ser-name').value.trim();
  if (!name) { toast('enter a series name'); return; }
  if (db.series.find(s => s.name.toLowerCase()===name.toLowerCase())) { toast('series already exists'); return; }
  db.series.push({ id:Date.now(), name, author:document.getElementById('ser-author').value.trim(), genre:document.getElementById('ser-genre').value.trim(), total:parseInt(document.getElementById('ser-total').value)||0 });
  ['ser-name','ser-author','ser-genre','ser-total'].forEach(i => document.getElementById(i).value='');
  save(); renderSeriesPage(); toast('series added!');
}
function deleteSeries(id) { db.series=db.series.filter(s=>s.id!==id); save(); renderSeriesPage(); }

function renderSeriesPage() {
  const el = document.getElementById('series-list');
  if (!db.series.length) { el.innerHTML='<div class="card"><div class="empty"><div class="empty-icon">📚</div><p>no series tracked yet</p></div></div>'; return; }
  el.innerHTML = db.series.map(s => {
    const books   = db.books.filter(b => b.series && b.series.toLowerCase()===s.name.toLowerCase());
    const done    = books.filter(b => b.status==='done').length;
    const reading = books.filter(b => b.status==='reading').length;
    const total   = s.total || books.length;
    const pct     = total ? Math.round(done/total*100) : 0;
    return `<div class="card">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:10px">
        <div><div style="font-size:15px;font-weight:500">${esc(s.name)}</div>
        <div style="font-size:12px;color:var(--text3)">${esc(s.author)}${s.genre?' · '+esc(s.genre):''}</div></div>
        <button class="btn-icon" onclick="deleteSeries(${s.id})">×</button>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:8px">${done}${s.total?' of '+s.total:''} books done${reading?' · '+reading+' in progress':''}</div>
      ${total ? `<div class="progress-bar" style="height:5px"><div class="progress-fill" style="width:${pct}%;background:var(--accent)"></div></div><div style="font-size:10px;color:var(--text3);margin-top:3px">${pct}%</div>` : ''}
      <div class="book-list" style="margin-top:10px">
        ${books.sort((a,b) => (a.seriesNum||99)-(b.seriesNum||99)).map(b =>
          `<div class="book-item"><div class="book-spine" style="background:${b.color};cursor:pointer" onclick="openColorModal(${b.id})"></div>
          <div class="book-meta"><div class="book-title-t">${esc(b.title)}</div>
          <div class="book-tags"><span class="pill pill-${b.status}">${b.status==='reading'?'reading':b.status==='want'?'want to read':'done'}</span>
          ${b.seriesNum?`<span style="font-size:10px;color:var(--text3)">book ${b.seriesNum}</span>`:''}</div></div></div>`
        ).join('')}
      </div></div>`;
  }).join('');
}

// ── GOALS ─────────────────────────────────────────────────────────
function setGoal()       { const v=parseInt(document.getElementById('goal-in').value);    if(v>0){db.goal=v;save();renderGoals();toast('goal set!');} }
function setDailyGoal()  { const v=parseInt(document.getElementById('daily-g-in').value); if(v>0){db.dailyGoal=v;save();renderGoals();toast('daily goal set!');} }
function setWeeklyGoal() { const v=parseInt(document.getElementById('weekly-g-in').value);if(v>0){db.weeklyGoal=v;save();renderGoals();toast('weekly goal set!');} }
function useStreakFreeze() { toast('🧊 streak freeze used!'); }

function renderGoals() {
  const done = db.books.filter(b=>b.status==='done').length;
  const pct  = db.goal ? Math.min(100,Math.round(done/db.goal*100)) : 0;
  const goalMet = db.goal>0 && done>=db.goal;
  document.getElementById('g-pct').textContent  = pct+'%';
  document.getElementById('g-desc').textContent = `${done} of ${db.goal} books`;
  document.getElementById('goal-in').placeholder  = db.goal;
  document.getElementById('daily-g-in').placeholder  = db.dailyGoal;
  document.getElementById('weekly-g-in').placeholder = db.weeklyGoal;

  const todayP = db.logs.filter(l=>l.date===todayStr()).reduce((s,l)=>s+l.pages,0);
  const weekP  = pagesInDays(7);
  const dpct   = Math.min(100,Math.round(todayP/db.dailyGoal*100));
  const wpct   = Math.min(100,Math.round(weekP/db.weeklyGoal*100));
  document.getElementById('daily-g-status').innerHTML  = `today: <strong style="color:${dpct>=100?'var(--green)':'var(--accent)'}">` + todayP + '/' + db.dailyGoal + ' (' + dpct + '%)</strong>';
  document.getElementById('weekly-g-status').innerHTML = `this week: <strong style="color:${wpct>=100?'var(--green)':'var(--accent)'}">` + weekP + '/' + db.weeklyGoal + ' (' + wpct + '%)</strong>';

  mkChart('goal-donut', {
    type: 'doughnut',
    data: { datasets:[{ data:[pct,100-pct], backgroundColor:[accentColor(),'rgba(128,128,128,0.08)'], borderWidth:0 }] },
    options: { responsive:false, cutout:'72%', plugins:{legend:{display:false},tooltip:{enabled:false}} }
  });

  const dLeft = Math.max(0, Math.ceil((new Date(new Date().getFullYear(),11,31)-new Date())/86400000));
  const bLeft = Math.max(0, db.goal-done);
  const avgD  = calcAvgDays();
  const dpb   = bLeft > 0 ? Math.ceil(dLeft/bLeft) : 0;
  const ontrack = avgD && avgD <= dpb;
  document.getElementById('pace-info').innerHTML = bLeft===0
    ? '<strong style="color:var(--green)">🎉 annual goal complete!</strong>'
    : `${bLeft} book${bLeft!==1?'s':''} left · ${dLeft} days remaining<br>finish a book every <strong>${dpb}</strong> days to hit your goal<br>`
      + (avgD ? `your average: <strong>${avgD} days/book</strong> · <span style="color:${ontrack?'var(--green)':'var(--red)'}">${ontrack?'on track ✓':'behind: pick up the pace!'}</span>` : 'log more books for pace analysis');

  const unlockedCard = document.getElementById('custom-theme-card');
  const lockedCard   = document.getElementById('custom-theme-locked');
  const lockHint     = document.getElementById('theme-lock-hint');
  if (unlockedCard) unlockedCard.style.display = goalMet ? 'block' : 'none';
  if (lockedCard)   lockedCard.style.display   = goalMet ? 'none'  : 'block';
  if (lockHint && !goalMet) lockHint.textContent = db.goal>0 ? `${done} of ${db.goal} books done — ${Math.max(0,db.goal-done)} to go!` : 'set a goal above to unlock';
  if (goalMet) syncCustomThemePickers();
}

// ── SHARE ─────────────────────────────────────────────────────────
function renderShare() {
  const done    = db.books.filter(b=>b.status==='done').length;
  const streak  = calcStreak();
  const pages   = db.logs.reduce((s,l)=>s+l.pages,0);
  const reading = db.books.filter(b=>b.status==='reading');
  const pct     = db.goal ? Math.min(100,Math.round(done/db.goal*100)) : 0;
  const acc     = accentColor();

  document.getElementById('share-pre').innerHTML = `
    <div style="font-family:'Instrument Serif',serif;font-size:18px;color:${acc};margin-bottom:12px">readtracker</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
      <div><div style="font-size:9px;color:#6b6259;text-transform:uppercase;letter-spacing:0.5px">streak</div><div style="font-size:22px;color:#ede8e1;font-family:'Instrument Serif',serif">${streak}d</div></div>
      <div><div style="font-size:9px;color:#6b6259;text-transform:uppercase;letter-spacing:0.5px">books done</div><div style="font-size:22px;color:#ede8e1;font-family:'Instrument Serif',serif">${done}</div></div>
      <div><div style="font-size:9px;color:#6b6259;text-transform:uppercase;letter-spacing:0.5px">pages</div><div style="font-size:22px;color:#ede8e1;font-family:'Instrument Serif',serif">${pages.toLocaleString()}</div></div>
    </div>
    <div style="height:3px;background:rgba(255,255,255,0.06);border-radius:2px;margin-bottom:6px">
      <div style="height:3px;background:${acc};border-radius:2px;width:${pct}%"></div></div>
    <div style="font-size:11px;color:#a09690">${done}/${db.goal} books · ${pct}% of ${new Date().getFullYear()} goal</div>
    ${reading.length ? `<div style="margin-top:10px;font-size:11px;color:#6b6259">reading now: <span style="color:#ede8e1">${reading.slice(0,2).map(b=>b.title).join(', ')}</span></div>` : ''}`;

  document.getElementById('embed-code').value = reading.length
    ? `<!-- readtracker widget -->\n<div style="font-family:sans-serif;background:#141210;color:#ede8e1;padding:14px;border-radius:10px;border:1px solid rgba(201,169,110,0.15);max-width:280px">\n  <div style="font-size:11px;color:${acc};margin-bottom:8px">currently reading</div>\n  ${reading.slice(0,3).map(b=>`<div style="margin-bottom:7px"><div style="font-size:13px;font-weight:500">${esc(b.title)}</div><div style="font-size:11px;color:#a09690">${esc(b.author)}</div>${b.pages?`<div style="height:2px;background:rgba(255,255,255,0.07);border-radius:1px;margin-top:5px"><div style="height:2px;background:${b.color};border-radius:1px;width:${Math.round((b.pagesRead||0)/b.pages*100)}%"></div></div>`:''}</div>`).join('')}\n</div>`
    : '<!-- no books currently reading -->';
}

function copyShareText() {
  const done=db.books.filter(b=>b.status==='done').length, streak=calcStreak(), pages=db.logs.reduce((s,l)=>s+l.pages,0);
  const reading=db.books.filter(b=>b.status==='reading').slice(0,2).map(b=>b.title).join(', ');
  navigator.clipboard.writeText(`📚 reading update: ${new Date().toLocaleDateString('en-US',{month:'long',year:'numeric'})}\n\n🔥 ${streak}-day streak\n📖 ${done} books done (${Math.round(done/db.goal*100)}% of ${db.goal}-book goal)\n📄 ${pages.toLocaleString()} pages read\n\nreading: ${reading||'nothing right now'}\n\n#readtracker`)
    .then(()=>toast('copied!')).catch(()=>toast('could not copy'));
}
function copyEmbed() {
  navigator.clipboard.writeText(document.getElementById('embed-code').value)
    .then(()=>toast('embed code copied!')).catch(()=>toast('could not copy'));
}

// ── IMPORT / EXPORT ───────────────────────────────────────────────
function importGoodreads(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    try {
      const lines   = e.target.result.split('\n');
      const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
      let count = 0;
      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]); if (!row.length) continue;
        const get = n => { const idx=headers.findIndex(h=>h.includes(n)); return idx>=0?(row[idx]||'').replace(/"/g,'').trim():''; };
        const title = get('title'); if (!title) continue;
        const shelf = (get('shelf')||get('exclusive shelf')||get('bookshelves')||'').toLowerCase();
        let status = 'want';
        if (shelf.includes('currently')) status='reading';
        else if (shelf.includes('read') && !shelf.includes('to-read')) status='done';
        if (db.books.find(b => b.title.toLowerCase()===title.toLowerCase())) continue;
        db.books.push({ id:Date.now()+i, title, author:get('author'), pages:parseInt(get('pages'))||0, genre:'', series:'', seriesNum:0, status, color:SPINE_COLORS[db.books.length%SPINE_COLORS.length], rating:Math.round(parseFloat(get('my rating'))||0), pagesRead:status==='done'?(parseInt(get('pages'))||0):0, startDate:get('date started')||(status!=='want'?todayStr():''), finishedDate:get('date read')||(status==='done'?todayStr():''), addedDate:todayStr() });
        count++;
      }
      save(); renderAll();
      document.getElementById('gr-status').textContent = `✓ imported ${count} books`;
      toast(`imported ${count} books!`);
    } catch(err) { document.getElementById('gr-status').textContent='error: '+err.message; }
  };
  r.readAsText(file);
}
function importCSV(input) {
  const file = input.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const lines = e.target.result.split('\n').slice(1); let count = 0;
    lines.forEach((line, i) => {
      const c = parseCSVRow(line).map(x => x.replace(/"/g,'').trim());
      if (!c[0]) return;
      const status = (c[3]||'want').toLowerCase();
      db.books.push({ id:Date.now()+i, title:c[0], author:c[1]||'', pages:parseInt(c[2])||0, status:['reading','want','done'].includes(status)?status:'want', genre:c[4]||'', series:c[5]||'', seriesNum:parseInt(c[6])||0, color:SPINE_COLORS[db.books.length%SPINE_COLORS.length], rating:0, pagesRead:status==='done'?(parseInt(c[2])||0):0, startDate:'', finishedDate:status==='done'?todayStr():'', addedDate:todayStr() });
      count++;
    });
    save(); renderAll(); toast(`imported ${count} books!`);
  };
  r.readAsText(file);
}
function parseCSVRow(row) {
  const r=[]; let cur='', inQ=false;
  for (const c of row) { if(c==='"')inQ=!inQ; else if(c===','&&!inQ){r.push(cur);cur='';} else cur+=c; }
  r.push(cur); return r;
}
function exportJSON() {
  const b=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`readtracker-${todayStr()}.json`; a.click(); toast('backup downloaded!');
}
function exportCSV() {
  const rows=[['Title','Author','Pages','Status','Genre','Series','SeriesNum','Rating','Started','Finished']];
  db.books.forEach(b=>rows.push([b.title,b.author,b.pages,b.status,b.genre,b.series,b.seriesNum,b.rating,b.startDate,b.finishedDate]));
  const csv=rows.map(r=>r.map(c=>'"'+(c||'').toString().replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`readtracker-books-${todayStr()}.csv`; a.click(); toast('CSV downloaded!');
}
function restoreJSON(input) {
  const f=input.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=e=>{ try{db={...db,...JSON.parse(e.target.result)};save();renderAll();toast('data restored!');}catch(e){toast('error reading file');} };
  r.readAsText(f);
}
function clearAll() {
  if (!confirm('delete ALL data?')) return;
  db={books:[],logs:[],series:[],friends:[],friendReqs:[],goal:24,dailyGoal:30,weeklyGoal:200,worms:{list:[],totalPagesMilestone:0,hunger:0},profile:{}};
  save(); renderAll(); toast('cleared');
}

// ── FRIENDS ───────────────────────────────────────────────────────
async function sendFriendRequest() {
  if (!sb||!currentUser){toast('sign in to add friends');return;}
  const username=document.getElementById('friend-username').value.trim(); if(!username)return;
  const {data:profiles,error}=await sb.from('profiles').select('id,username').eq('username',username).single();
  const statusEl=document.getElementById('friend-req-status');
  if(error||!profiles){statusEl.textContent='user not found';return;}
  if(profiles.id===currentUser.id){statusEl.textContent="that's you!";return;}
  const {error:e2}=await sb.from('friendships').insert({requester_id:currentUser.id,addressee_id:profiles.id,status:'pending'});
  if(e2){statusEl.textContent='could not send (may already be friends)';return;}
  statusEl.textContent='friend request sent!';
  document.getElementById('friend-username').value='';
  setTimeout(()=>statusEl.textContent='',3000);
}
async function loadFriends() {
  if(!sb||!currentUser){renderFriends();return;}
  try {
    const {data:sent}=await sb.from('friendships').select('addressee_id,status').eq('requester_id',currentUser.id);
    const {data:received}=await sb.from('friendships').select('requester_id,status').eq('addressee_id',currentUser.id);
    const acceptedIds=[...(sent||[]).filter(r=>r.status==='accepted').map(r=>r.addressee_id),...(received||[]).filter(r=>r.status==='accepted').map(r=>r.requester_id)];
    db.friendReqs=(received||[]).filter(r=>r.status==='pending').map(r=>r.requester_id);
    if(acceptedIds.length){const {data:profiles}=await sb.from('profiles').select('id,username').in('id',acceptedIds);db.friends=(profiles||[]).map(p=>({id:p.id,username:p.username}));}
    for(const f of db.friends){const {data:fd}=await sb.from('userdata').select('data').eq('user_id',f.id).single();if(fd&&fd.data){f.booksRead=(fd.data.books||[]).filter(b=>b.status==='done').length;f.reading=(fd.data.books||[]).filter(b=>b.status==='reading').map(b=>b.title);}}
    renderFriends();
  } catch(e){renderFriends();}
}
async function acceptFriend(uid) {if(!sb||!currentUser)return;await sb.from('friendships').update({status:'accepted'}).eq('requester_id',uid).eq('addressee_id',currentUser.id);loadFriends();}
async function declineFriend(uid) {if(!sb||!currentUser)return;await sb.from('friendships').delete().eq('requester_id',uid).eq('addressee_id',currentUser.id);db.friendReqs=db.friendReqs.filter(i=>i!==uid);renderFriends();}
function renderFriends() {
  const pendingEl=document.getElementById('pending-list'),friendsEl=document.getElementById('friends-list'),countEl=document.getElementById('pending-count');
  if(!sb||!currentUser){pendingEl.innerHTML='<div class="empty"><p>sign in to connect</p></div>';friendsEl.innerHTML='<div class="empty"><p>sign in to see friends</p></div>';return;}
  const reqs=db.friendReqs||[];
  if(reqs.length){countEl.style.display='inline';countEl.textContent=reqs.length;pendingEl.innerHTML=reqs.map(uid=>`<div class="friend-item"><div class="friend-av">?</div><div class="friend-info"><div class="friend-name">${uid.slice(0,8)}…</div><div class="friend-stat">wants to be friends</div></div><div style="display:flex;gap:6px"><button class="btn btn-primary btn-sm" onclick="acceptFriend('${uid}')">accept</button><button class="btn btn-ghost btn-sm" onclick="declineFriend('${uid}')">decline</button></div></div>`).join('');}
  else{countEl.style.display='none';pendingEl.innerHTML='<div class="empty"><p>no pending requests</p></div>';}
  const fr=db.friends||[];
  friendsEl.innerHTML=fr.length?fr.map(f=>`<div class="friend-item"><div class="friend-av">${(f.username||'?')[0].toUpperCase()}</div><div class="friend-info"><div class="friend-name">${esc(f.username)}</div><div class="friend-stat">${f.booksRead||0} books done</div>${f.reading&&f.reading.length?`<div class="friend-reading">reading: ${f.reading.slice(0,2).map(t=>esc(t)).join(', ')}</div>`:''}</div></div>`).join(''):'<div class="empty"><p>no friends yet</p></div>';
}
