// ═══════════════════════════════════════════════════════════════
//  READTRACKER  ·  stats.js  ·  charts and statistics page
// ═══════════════════════════════════════════════════════════════

function renderStats() {
  // ── metrics ──
  const tp   = db.logs.reduce((s,l) => s+l.pages, 0);
  const tm   = db.logs.reduce((s,l) => s+l.minutes, 0);
  const done = db.books.filter(b => b.status==='done').length;
  const byDay = {};
  db.logs.forEach(l => { byDay[l.date] = (byDay[l.date]||0) + l.pages; });
  const best = Object.entries(byDay).sort((a,b) => b[1]-a[1])[0];

  const metricsEl = document.getElementById('stats-metrics');
  if (metricsEl) {
    metricsEl.innerHTML = [
      `<div class="metric"><div class="metric-label">total pages</div><div class="metric-val">${tp.toLocaleString()}</div></div>`,
      `<div class="metric"><div class="metric-label">total hours</div><div class="metric-val">${Math.round(tm/60)}</div></div>`,
      `<div class="metric"><div class="metric-label">books done</div><div class="metric-val">${done}</div></div>`,
      `<div class="metric"><div class="metric-label">best day</div><div class="metric-val">${best?best[1]:'—'}</div><div class="metric-sub">${best?fmtDate(best[0]):''}</div></div>`,
    ].join('');
  }

  // Wait for next frame so canvases are visible before Chart.js tries to size them
  requestAnimationFrame(() => {
    _renderMonthlyChart();
    _renderDaily30Chart();
    _renderGenreChart();
    _renderDowChart();
  });

  // ── finished books list ──
  const finishedEl = document.getElementById('stats-done-list');
  if (finishedEl) {
    const finished = [...db.books.filter(b => b.status==='done')].sort((a,b) => (b.rating||0)-(a.rating||0));
    finishedEl.innerHTML = finished.length
      ? `<div class="book-list">${finished.map(b => `
          <div class="book-item">
            <div class="book-spine" style="background:${b.color}"></div>
            <div class="book-meta">
              <div class="book-title-t">${esc(b.title)}</div>
              <div class="book-author-t">${esc(b.author)}${b.finishedDate?' · '+fmtDate(b.finishedDate):''}</div>
            </div>
            <div style="font-size:12px;white-space:nowrap">${starsFixed(b.rating||0)}</div>
          </div>`).join('')}</div>`
      : '<div class="empty"><p>no finished books yet</p></div>';
  }
}

function _renderMonthlyChart() {
  const mc = {};
  db.books.filter(b => b.status==='done' && b.finishedDate).forEach(b => {
    const m = b.finishedDate.slice(0,7);
    mc[m] = (mc[m]||0)+1;
  });
  const months = Object.keys(mc).sort().slice(-10);
  const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  mkChart('monthly-chart', {
    type: 'bar',
    data: {
      labels: months.map(m => MONTH_LABELS[parseInt(m.split('-')[1])-1]),
      datasets: [{ data: months.map(m => mc[m]), backgroundColor: '#5dbf8acc', borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#6b6259',font:{size:10}} },
        y: { grid:{color:'rgba(128,128,128,0.08)'}, ticks:{color:'#6b6259',font:{size:10},stepSize:1,maxTicksLimit:5} }
      }
    }
  });
}

function _renderDaily30Chart() {
  const d30l = [], d30d = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const s = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    d30l.push(i % 5 === 0 ? String(d.getDate()) : '');
    d30d.push(db.logs.filter(l => l.date===s).reduce((a,l) => a+l.pages, 0));
  }
  mkChart('daily30-chart', {
    type: 'line',
    data: {
      labels: d30l,
      datasets: [{ data: d30d, borderColor:'#7ab3e0', backgroundColor:'rgba(122,179,224,0.07)', fill:true, tension:0.4, pointRadius:2, pointBackgroundColor:'#7ab3e0' }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#6b6259',font:{size:10}} },
        y: { grid:{color:'rgba(128,128,128,0.08)'}, ticks:{color:'#6b6259',font:{size:10},maxTicksLimit:4} }
      }
    }
  });
}

function _renderGenreChart() {
  const gc = {};
  db.books.filter(b => b.genre).forEach(b => {
    // use just the primary genre (before any slash)
    const primary = (b.genre||'').split('/')[0].trim();
    if (primary) gc[primary] = (gc[primary]||0)+1;
  });
  const genres = Object.entries(gc).sort((a,b) => b[1]-a[1]).slice(0,6);
  if (!genres.length) return;
  mkChart('genre-chart', {
    type: 'doughnut',
    data: {
      labels: genres.map(g => g[0]),
      datasets: [{ data: genres.map(g => g[1]), backgroundColor: CHART_COLORS.slice(0,genres.length), borderWidth:0, hoverOffset:4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: { legend: { position:'right', labels:{color:'#a09690',font:{size:10},boxWidth:8,padding:6} } }
    }
  });
}

function _renderDowChart() {
  const dow = [0,0,0,0,0,0,0];
  db.logs.forEach(l => { const d = new Date(l.date+'T12:00:00'); dow[d.getDay()] += l.pages; });
  mkChart('dow-chart', {
    type: 'bar',
    data: {
      labels: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
      datasets: [{ data: dow, backgroundColor: '#b39ddbcc', borderRadius: 4 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid:{display:false}, ticks:{color:'#6b6259',font:{size:10}} },
        y: { grid:{color:'rgba(128,128,128,0.08)'}, ticks:{color:'#6b6259',font:{size:10},maxTicksLimit:4} }
      }
    }
  });
}
