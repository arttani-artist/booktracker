// ═══════════════════════════════════════════════════════════════
//  READTRACKER  ·  discover.js  ·  recs, forum, profile, reader
// ═══════════════════════════════════════════════════════════════

// ── GENRE → OPENLIBRARY SUBJECT MAP ──────────────────────────────
const GENRE_SUBJECT_MAP = {
  'fantasy':             'fantasy',
  'epic fantasy':        'fantasy',
  'dark fantasy':        'fantasy',
  'sci-fi':              'science_fiction',
  'science fiction':     'science_fiction',
  'sci fi':              'science_fiction',
  'horror':              'horror',
  'gothic horror':       'horror',
  'gothic fiction':      'gothic_fiction',
  'thriller':            'thriller',
  'mystery':             'mystery_and_detective_stories',
  'detective':           'mystery_and_detective_stories',
  'crime':               'crime_fiction',
  'true crime':          'true_crime',
  'romance':             'romance',
  'historical fiction':  'historical_fiction',
  'literary fiction':    'fiction',
  'contemporary fiction':'fiction',
  'fiction':             'fiction',
  'coming of age':       'bildungsroman',
  'adventure':           'adventure_stories',
  'memoir':              'biography_and_autobiography',
  'biography':           'biography_and_autobiography',
  'non-fiction':         'nonfiction',
  'nonfiction':          'nonfiction',
  'mythology':           'mythology',
  'young adult':         'young_adult_fiction',
  'ya':                  'young_adult_fiction',
  'middle grade':        'juvenile_fiction',
  "children's":          'juvenile_fiction',
  'dystopian':           'dystopian_fiction',
  'graphic novel':       'comics_and_graphic_novels',
  'comics':              'comics_and_graphic_novels',
  'poetry':              'poetry',
  'short stories':       'short_stories',
  'self-help':           'self-help',
  'philosophy':          'philosophy',
  'classic literature':  'classic_literature',
  'classics':            'classic_literature',
  'classic':             'classic_literature',
  'history':             'history',
  'science':             'science',
  'psychology':          'psychology',
  'travel':              'travel',
};

function getSubjectSlug(genre) {
  if (!genre) return null;
  // Handle "Genre1 / Genre2" — use primary
  const primary = genre.split('/')[0].trim().toLowerCase().replace(/['']/g, "'");
  if (GENRE_SUBJECT_MAP[primary]) return GENRE_SUBJECT_MAP[primary];
  // Partial match (longer keys first)
  const keys = Object.keys(GENRE_SUBJECT_MAP).sort((a,b) => b.length-a.length);
  for (const key of keys) {
    if (primary.includes(key) || key.includes(primary)) return GENRE_SUBJECT_MAP[key];
  }
  // Fallback: slugify the primary genre
  return primary.replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'');
}

// ── RECOMMENDATIONS ───────────────────────────────────────────────
async function renderRecommendations() {
  const el    = document.getElementById('rec-list');
  const whyEl = document.getElementById('rec-why');
  if (!el) return;

  if (!db.books.length) {
    el.innerHTML = '<div class="empty"><p>add some books first and we\'ll suggest more!</p></div>';
    return;
  }

  // Build taste profile from library
  const genreCount = {}, authorCount = {};
  db.books.forEach(b => {
    if (b.genre)   genreCount[b.genre.toLowerCase()]   = (genreCount[b.genre.toLowerCase()]||0)   + (b.status==='done'?2:1);
    if (b.author)  authorCount[b.author.toLowerCase()]  = (authorCount[b.author.toLowerCase()]||0) + (b.status==='done'?2:1);
  });

  const topGenres  = Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,3).map(e=>e[0]);
  const topAuthors = Object.entries(authorCount).sort((a,b)=>b[1]-a[1]).slice(0,2).map(e=>e[0]);
  const subjectSlugs = [...new Set(topGenres.map(getSubjectSlug).filter(Boolean))].slice(0,2);

  if (!subjectSlugs.length) {
    if (!topAuthors.length) {
      el.innerHTML = '<div class="empty"><p>add genres to your books so we can recommend more!</p></div>';
      return;
    }
    if (whyEl) whyEl.textContent = 'books by authors you like';
    await _fetchRecsByAuthor(topAuthors[0]);
    return;
  }

  if (whyEl) whyEl.textContent = `fetching picks for: ${topGenres.slice(0,2).join(', ')}…`;
  el.innerHTML = '<div class="empty" style="padding:20px"><div style="font-size:22px;margin-bottom:8px">⏳</div><p>finding books for you…</p></div>';

  try {
    const libraryTitles = new Set(db.books.map(b => b.title.toLowerCase()));
    const offset = Math.floor(Math.random() * 40);

    const fetches = subjectSlugs.map(slug =>
      fetch(`https://openlibrary.org/subjects/${slug}.json?limit=20&offset=${offset}`)
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
    );
    const results = await Promise.all(fetches);

    const seen = new Set();
    let pool = [];
    results.forEach((data, si) => {
      if (!data?.works) return;
      data.works.forEach(w => {
        const title  = (w.title||'').trim();
        const author = (w.authors?.[0]?.name) || '';
        const pages  = w.number_of_pages || 0;
        const coverId= w.cover_id || null;
        const key    = title.toLowerCase();
        if (!title || seen.has(key) || libraryTitles.has(key)) return;
        seen.add(key);
        let score = coverId ? 2 : 0;
        if (pages > 100 && pages < 900) score += 1;
        topAuthors.forEach(a => { if (author.toLowerCase().includes(a) || a.includes(author.toLowerCase())) score += 4; });
        pool.push({ title, author, pages, coverId, subject: topGenres[si]||topGenres[0], score });
      });
    });

    pool.sort((a,b) => b.score - a.score || Math.random()-0.5);
    pool = pool.slice(0, 8);

    if (!pool.length) {
      el.innerHTML = '<div class="empty"><p>no recommendations right now — try adding genres to your books!</p></div>';
      if (whyEl) whyEl.textContent = 'based on your library';
      return;
    }

    if (whyEl) whyEl.textContent = `based on your interest in: ${topGenres.slice(0,2).join(', ')}`;
    el.innerHTML = pool.map(r => _recItemHTML(r.title, r.author, r.pages, r.coverId ? `https://covers.openlibrary.org/b/id/${r.coverId}-M.jpg` : '', esc(r.subject))).join('');

  } catch (e) {
    el.innerHTML = '<div class="empty"><p>couldn\'t reach OpenLibrary — check your connection</p></div>';
    if (whyEl) whyEl.textContent = 'based on your library';
  }
}

async function _fetchRecsByAuthor(authorName) {
  const el = document.getElementById('rec-list');
  el.innerHTML = '<div class="empty" style="padding:20px"><div style="font-size:22px;margin-bottom:8px">⏳</div><p>finding books for you…</p></div>';
  try {
    const libraryTitles = new Set(db.books.map(b => b.title.toLowerCase()));
    const res  = await fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(authorName)}&limit=20&fields=title,author_name,number_of_pages_median,cover_i,first_publish_year`);
    const data = await res.json();
    const works = (data.docs||[]).filter(d => d.title && !libraryTitles.has(d.title.toLowerCase())).slice(0,8);
    if (!works.length) { el.innerHTML = '<div class="empty"><p>no new books found for this author</p></div>'; return; }
    el.innerHTML = works.map(d => {
      const coverUrl = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : '';
      return _recItemHTML(d.title||'', (d.author_name||[])[0]||'', d.number_of_pages_median||0, coverUrl, d.first_publish_year?String(d.first_publish_year):'');
    }).join('');
  } catch(e) {
    el.innerHTML = '<div class="empty"><p>couldn\'t reach OpenLibrary — check your connection</p></div>';
  }
}

function _recItemHTML(title, author, pages, coverUrl, label) {
  const tEsc = title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  const aEsc = author.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
  return `<div class="suggest-item">
    <div style="display:flex;gap:12px;align-items:flex-start">
      ${coverUrl
        ? `<img src="${coverUrl}" alt="" style="width:42px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0" onerror="this.style.display='none'" />`
        : `<div style="width:42px;height:60px;background:var(--bg4);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:18px">📖</div>`}
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
        <div style="font-size:11px;color:var(--accent);margin-bottom:3px">${esc(author)}</div>
        <div style="font-size:10px;color:var(--text3)">${pages?pages+' pages · ':''}${esc(label)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" style="flex-shrink:0;margin-top:4px" onclick="addSearchedBook('${tEsc}','${aEsc}',${pages})">+ add</button>
    </div></div>`;
}

function refreshRecommendations() { renderRecommendations(); }

// ── BOOK SEARCH ───────────────────────────────────────────────────
async function searchBooks() {
  const q = document.getElementById('book-search-input').value.trim(); if (!q) return;
  const statusEl  = document.getElementById('book-search-status');
  const resultsEl = document.getElementById('book-search-results');
  statusEl.textContent = 'searching…'; resultsEl.innerHTML = '';
  try {
    const res  = await fetch(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,number_of_pages_median,cover_i,first_publish_year,key`);
    const data = await res.json();
    if (!data.docs?.length) { statusEl.textContent='no results found'; return; }
    statusEl.textContent = `${data.numFound.toLocaleString()} results`;
    resultsEl.innerHTML = data.docs.map(d => {
      const title   = d.title||'Unknown';
      const author  = (d.author_name||[]).slice(0,2).join(', ') || 'Unknown author';
      const pages   = d.number_of_pages_median||0;
      const year    = d.first_publish_year||'';
      const cover   = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg` : '';
      const alreadyHave = db.books.some(b => b.title.toLowerCase()===title.toLowerCase());
      const tEsc = title.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      const aEsc = author.replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      return `<div class="book-search-item">
        ${cover ? `<img src="${cover}" alt="" class="book-search-cover" onerror="this.style.display='none'" />` : `<div class="book-search-cover-placeholder">📖</div>`}
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(title)}</div>
          <div style="font-size:11px;color:var(--accent)">${esc(author)}</div>
          <div style="font-size:10px;color:var(--text3)">${year?year+' · ':''}${pages?pages+' pages':''}</div>
        </div>
        <div style="flex-shrink:0">${alreadyHave ? '<span style="font-size:11px;color:var(--text3)">in library</span>' : `<button class="btn btn-ghost btn-sm" onclick="addSearchedBook('${tEsc}','${aEsc}',${pages})">+ add</button>`}</div>
      </div>`;
    }).join('');
  } catch(e) { statusEl.textContent='search failed: check your connection'; }
}

function addSearchedBook(title, author, pages) {
  db.books.push({ id:Date.now(), title, author, pages:pages||0, genre:'', series:'', seriesNum:0, status:'want', color:SPINE_COLORS[db.books.length%SPINE_COLORS.length], rating:0, pagesRead:0, startDate:'', finishedDate:'', addedDate:todayStr() });
  save(); renderAll(); toast(`"${title}" added to want to read!`);
}

// ── SPOTIFY ───────────────────────────────────────────────────────
const PRESET_PLAYLISTS = { 'deep-focus':'37i9dQZF1DWZeKCadgRdKQ', 'cozy':'37i9dQZF1DX4sWSpwq3LiO', 'epic':'37i9dQZF1DX1s9knjP51Oa', 'night':'37i9dQZF1DX3Ogo9pFvBkY', 'baroque':'37i9dQZF1DWWEJlAGA9gs0', 'lofi':'37i9dQZF1DX8NTLI2TtZa6' };
function loadPresetPlaylist(key) { const id=PRESET_PLAYLISTS[key]; if(id) embedSpotify(`https://open.spotify.com/playlist/${id}`); }
function loadSpotifyEmbed() { const raw=document.getElementById('spotify-url-input').value.trim(); if(raw) embedSpotify(raw); }
function embedSpotify(url) {
  const match = url.match(/spotify\.com\/(playlist|album|track|artist)\/([A-Za-z0-9]+)/);
  if (!match) { toast('paste a valid spotify link'); return; }
  const [,type,id] = match;
  const iframe = document.getElementById('spotify-iframe');
  iframe.src = `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  iframe.style.display = 'block';
  document.getElementById('spotify-placeholder').style.display = 'none';
}

// ── PDF READER ────────────────────────────────────────────────────
let pdfDoc=null, pdfPage=1, pdfZoom=1.0;

function loadPDF(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = new Uint8Array(e.target.result);
    if (!window.pdfjsLib) { toast('PDF library not loaded'); return; }
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    window.pdfjsLib.getDocument({ data }).promise.then(doc => {
      pdfDoc=doc; pdfPage=1;
      document.getElementById('pdf-page-total').textContent = doc.numPages;
      document.getElementById('reader-controls').style.display    = 'block';
      document.getElementById('pdf-canvas-wrap').style.display    = 'block';
      document.getElementById('reader-upload-card').style.display = 'none';
      renderPDFPage();
    }).catch(() => toast('could not read PDF'));
  };
  reader.readAsArrayBuffer(file);
}
function renderPDFPage() {
  if (!pdfDoc) return;
  pdfDoc.getPage(pdfPage).then(page => {
    const vp = page.getViewport({ scale: pdfZoom });
    const canvas = document.getElementById('pdf-canvas');
    canvas.width=vp.width; canvas.height=vp.height; canvas.style.maxWidth='100%';
    page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    document.getElementById('pdf-page-num').textContent   = pdfPage;
    document.getElementById('pdf-zoom-label').textContent = Math.round(pdfZoom*100)+'%';
  });
}
function pdfNextPage() { if(pdfDoc&&pdfPage<pdfDoc.numPages){pdfPage++;renderPDFPage();} }
function pdfPrevPage() { if(pdfDoc&&pdfPage>1){pdfPage--;renderPDFPage();} }
function pdfZoomIn()   { pdfZoom=Math.min(3,pdfZoom+0.2); renderPDFPage(); }
function pdfZoomOut()  { pdfZoom=Math.max(0.4,pdfZoom-0.2); renderPDFPage(); }
function closePDF() {
  pdfDoc=null; pdfPage=1; pdfZoom=1.0;
  document.getElementById('reader-controls').style.display    = 'none';
  document.getElementById('pdf-canvas-wrap').style.display    = 'none';
  document.getElementById('reader-upload-card').style.display = 'block';
  document.getElementById('pdf-file-input').value = '';
}

// ── FORUM ─────────────────────────────────────────────────────────
let forumTagFilter = 'all';
let forumRealtime  = null;

async function renderForum() {
  const list = document.getElementById('forum-posts-list'); if (!list) return;
  list.innerHTML = '<div class="empty"><p>loading…</p></div>';
  let query = sb.from('forum_posts').select('*, forum_comments(*)').order('created_at', { ascending: false });
  if (forumTagFilter !== 'all') query = query.eq('tag', forumTagFilter);
  const { data, error } = await query;
  if (error) { list.innerHTML='<div class="empty"><p>failed to load posts</p></div>'; return; }
  const posts = data||[];

  let myLikes = new Set();
  if (sbUser()) {
    const { data: likesData } = await sb.from('forum_likes').select('post_id').eq('user_id', sbUser().id);
    (likesData||[]).forEach(l => myLikes.add(l.post_id));
  }

  if (!posts.length) { list.innerHTML='<div class="empty"><div class="empty-icon">✉️</div><p>no posts yet — be the first!</p></div>'; return; }
  const tagEmoji = { discussion:'💬', review:'⭐', recommendation:'📚', question:'❓', rant:'🔥' };
  const myUserId = sbUser()?.id;

  list.innerHTML = posts.map(p => {
    const liked    = myLikes.has(p.id);
    const comments = p.forum_comments||[];
    const commentsHtml = comments.map(c =>
      `<div class="forum-comment"><span class="forum-comment-author">${esc(c.author)}</span><span class="forum-comment-time">${timeAgo(new Date(c.created_at).getTime())}</span><br>${esc(c.body)}</div>`
    ).join('');
    const canDelete = myUserId && p.user_id===myUserId;
    return `<div class="forum-post" id="fp-${p.id}">
      <div class="forum-post-header">
        <div class="forum-av">${esc(p.author).charAt(0).toUpperCase()}</div>
        <div><div class="forum-author">${esc(p.author)}</div><div class="forum-time">${timeAgo(new Date(p.created_at).getTime())}</div></div>
        <div class="forum-tag">${tagEmoji[p.tag]||''}&nbsp;${p.tag}</div>
      </div>
      <div class="forum-title" onclick="toggleForumComments(${p.id})">${esc(p.title)}</div>
      <div class="forum-body">${esc(p.body)}</div>
      <div class="forum-footer">
        <button class="forum-action-btn${liked?' liked':''}" onclick="likePost(${p.id},${liked})">♥ ${p.likes}</button>
        <button class="forum-action-btn" onclick="toggleForumComments(${p.id})">💬 ${comments.length} comments</button>
        ${canDelete?`<button class="forum-action-btn" onclick="deleteForumPost(${p.id})" style="margin-left:auto;color:var(--text3)">✕ delete</button>`:''}
      </div>
      <div class="forum-comments-wrap" id="fc-${p.id}">
        ${commentsHtml}
        ${sbUser()
          ? `<div style="display:flex;gap:6px;margin-top:8px"><input placeholder="add a comment…" style="flex:1;font-size:12px;padding:6px 10px" id="comment-in-${p.id}" onkeydown="if(event.key==='Enter')addComment(${p.id})" /><button class="btn btn-ghost btn-sm" onclick="addComment(${p.id})">post</button></div>`
          : '<div style="font-size:12px;color:var(--text3);margin-top:8px">sign in to comment</div>'}
      </div>
    </div>`;
  }).join('');

  _startForumRealtime();
}

function _startForumRealtime() {
  if (forumRealtime) return;
  forumRealtime = sb.channel('forum-changes')
    .on('postgres_changes', { event:'*', schema:'public', table:'forum_posts' },   () => renderForum())
    .on('postgres_changes', { event:'*', schema:'public', table:'forum_comments' }, () => renderForum())
    .subscribe();
}

function filterForum(tag, btn) {
  forumTagFilter = tag;
  document.querySelectorAll('#forum-tag-filters .forum-tag-btn').forEach(b => b.classList.toggle('active', b.dataset.tag===tag));
  renderForum();
}

async function submitForumPost() {
  if (!sbUser()) { toast('sign in to post!'); return; }
  const title = document.getElementById('forum-new-title').value.trim();
  const body  = document.getElementById('forum-new-body').value.trim();
  const tag   = document.getElementById('forum-new-tag').value;
  if (!title||!body) { toast('fill in a title and body!'); return; }
  const author = db.profile?.name || sbUser().email.split('@')[0];
  const { error } = await sb.from('forum_posts').insert({ user_id:sbUser().id, author, title, body, tag, likes:0 });
  if (error) { toast('post failed: '+error.message); return; }
  document.getElementById('forum-new-title').value = '';
  document.getElementById('forum-new-body').value  = '';
  toast('posted! ✉️');
  renderForum();
}

async function likePost(postId, currentlyLiked) {
  if (!sbUser()) { toast('sign in to like!'); return; }
  const { data: p } = await sb.from('forum_posts').select('likes').eq('id', postId).single();
  if (currentlyLiked) {
    await sb.from('forum_likes').delete().eq('post_id', postId).eq('user_id', sbUser().id);
    await sb.from('forum_posts').update({ likes: Math.max(0,(p?.likes||1)-1) }).eq('id', postId);
  } else {
    const { error } = await sb.from('forum_likes').insert({ post_id:postId, user_id:sbUser().id });
    if (error) { toast('already liked!'); return; }
    await sb.from('forum_posts').update({ likes: (p?.likes||0)+1 }).eq('id', postId);
  }
  renderForum();
}

async function addComment(postId) {
  if (!sbUser()) { toast('sign in to comment!'); return; }
  const inp = document.getElementById(`comment-in-${postId}`); if (!inp) return;
  const body = inp.value.trim(); if (!body) return;
  const author = db.profile?.name || sbUser().email.split('@')[0];
  const { error } = await sb.from('forum_comments').insert({ post_id:postId, user_id:sbUser().id, author, body });
  if (error) { toast('comment failed: '+error.message); return; }
  inp.value = '';
  renderForum();
  setTimeout(() => { document.getElementById(`fc-${postId}`)?.classList.add('open'); }, 300);
}

async function deleteForumPost(id) {
  if (!sbUser()) return;
  await sb.from('forum_posts').delete().eq('id', id).eq('user_id', sbUser().id);
  renderForum();
}

function toggleForumComments(id) {
  document.getElementById(`fc-${id}`)?.classList.toggle('open');
}

// ── PROFILE ───────────────────────────────────────────────────────
async function loadProfile() {
  const user = sbUser(); if (!user) return;
  const { data } = await sb.from('profiles').select('*').eq('id', user.id).single();
  if (data) {
    if (!db.profile) db.profile = {};
    db.profile.name     = data.username||'';
    db.profile.bio      = data.bio||'';
    db.profile.favGenre = data.fav_genre||'';
  }
  renderProfilePage();
}

async function saveProfile() {
  const user    = sbUser();
  const name    = document.getElementById('profile-name-in').value.trim();
  const bio     = document.getElementById('profile-bio-in').value.trim();
  const genre   = document.getElementById('profile-fav-genre-in').value.trim();
  if (user) {
    const { error } = await sb.from('profiles').upsert({ id:user.id, username:name, bio, fav_genre:genre });
    if (error) { toast('save failed: '+error.message); return; }
  }
  if (!db.profile) db.profile = {};
  db.profile.name = name; db.profile.bio = bio; db.profile.favGenre = genre;
  save(); renderProfilePage(); toast('profile saved!');
}

function renderProfilePage() {
  if (!db.profile) db.profile = {};
  const name = db.profile.name || sbUser()?.email?.split('@')[0] || 'bookworm';
  const bio  = db.profile.bio  || 'no bio yet';

  const setText = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  setText('profile-av-display',       name.charAt(0).toUpperCase());
  setText('profile-username-display', name);
  setText('profile-bio-display',      bio + (db.profile.favGenre ? ' · ❤️ '+db.profile.favGenre : ''));
  setText('profile-books-read',       db.books.filter(b=>b.status==='done').length);
  setText('profile-pages-read',       db.logs.reduce((a,s)=>a+(s.pages||0),0).toLocaleString());
  setText('profile-worm-count',       (db.worms?.list||[]).length);

  const setVal = (id, v) => { const el=document.getElementById(id); if(el) el.value=v; };
  setVal('profile-name-in',      db.profile.name||'');
  setVal('profile-bio-in',       db.profile.bio||'');
  setVal('profile-fav-genre-in', db.profile.favGenre||'');

  _loadMyPostsForProfile();
}

async function _loadMyPostsForProfile() {
  const pList = document.getElementById('profile-posts-list'); if (!pList) return;
  if (!sbUser()) { pList.innerHTML='<div class="empty"><p>sign in to see your posts</p></div>'; return; }
  const { data } = await sb.from('forum_posts').select('*').eq('user_id', sbUser().id).order('created_at',{ascending:false});
  const posts = data||[];
  const countEl = document.getElementById('profile-post-count'); if (countEl) countEl.textContent = posts.length;
  pList.innerHTML = posts.length
    ? posts.map(p => `<div style="padding:10px 0;border-bottom:1px solid var(--border)"><div style="font-size:13px;font-weight:500;color:var(--text)">${esc(p.title)}</div><div style="font-size:11px;color:var(--text3)">${p.tag} · ${timeAgo(new Date(p.created_at).getTime())}</div></div>`).join('')
    : '<div class="empty"><p>no posts yet</p></div>';
}
