(function SelectPiSnapshotUI() {

  // 1. Auth check
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Skylinks Tools: No auth token found in localStorage. Make sure you are logged into the SelectPi Portal.');
    return;
  }

  const { escHtml, makeLogger, createModal, apiClient, dates } = window.SkylinksUtils;
  const log = makeLogger('SP Snapshot');

  const todayStr = dates.todayLocal();

  const api = apiClient({ auth: { bearerFromLocalStorage: 'token' } });
  const post = (path, body) => api.post(path, body);

  // Inject comprehensive responsive styles for the KPI grid, bucket grid, and mobile card layout.
  // These are not handled by the generic modal responsive style and must be injected separately.
  document.getElementById('sps-responsive')?.remove();
  const _style = document.createElement('style');
  _style.id = 'sps-responsive';
  _style.textContent = `
    #sps-top-grid, #sps-bucket-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    @media (max-width: 720px) {
      #sps-top-grid, #sps-bucket-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 599px) {
      #sp-snapshot-overlay { align-items: flex-start !important; }
      #sp-snapshot-overlay .sps-card {
        width: 100% !important; max-width: 100% !important; border-radius: 0 !important;
        box-shadow: none !important; max-height: 100vh; max-height: 100dvh;
      }
      #sps-body { padding: 12px !important; }
      #sps-date-label { display: none; }
      #sp-snapshot-overlay .sps-kpi-row {
        display: grid !important; grid-template-columns: 1fr 1fr; gap: 12px !important;
      }
      #sp-snapshot-overlay .sps-kpi { min-width: 0 !important; flex: none !important; }
    }
    @media (max-width: 380px) {
      #sp-snapshot-overlay .sps-kpi-row { grid-template-columns: 1fr !important; }
    }
  `;
  document.head.appendChild(_style);

  // 2. State
  const state = { charts: {} };

  function destroyCharts() {
    Object.values(state.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
    state.charts = {};
  }

  const BODY_HTML = `
<div style="background:#eeb02b;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:-28px -32px 24px;border-radius:14px 14px 0 0;">
  <div>
    <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',sans-serif;color:#1c1b19;">Daily Snapshot — Select Pi</h2>
    <p id="sps-date-label" style="margin:4px 0 0 0;font-size:13px;color:#3d3800;"></p>
  </div>
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <input id="sps-date" type="date" value="${todayStr}" max="${todayStr}"
      style="padding:8px 10px;border:1.5px solid #d1a800;border-radius:8px;font-size:13px;background:#fff;color:#262b2f;outline:none;" />
    <button id="sps-refresh" style="background:#1c1b19;color:#eeb02b;border:none;padding:8px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Segoe UI',sans-serif;">Refresh</button>
  </div>
</div>
<div id="sps-progress-wrap" style="display:none;margin:0 -32px 0;">
  <div style="background:#e2e8f0;height:4px;overflow:hidden;">
    <div id="sps-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .25s;"></div>
  </div>
</div>
<div id="sps-errors"></div>
<div id="sps-body" style="padding-top:16px;">
  <div style="text-align:center;padding:48px;color:#64748b;font-size:14px;">Loading…</div>
</div>`;

  const modal = createModal({
    id: 'sp-snapshot',
    title: '',
    runLabel: null,
    variant: 'wide',
    body: BODY_HTML,
    onClose: () => {
      destroyCharts();
      document.getElementById('sps-responsive')?.remove();
    },
  });

  // 3. Helpers
  const $           = id => document.getElementById(id);
  const setProgress = pct => { $('sps-bar').style.width = pct + '%'; };
  const showProgress = () => { $('sps-progress-wrap').style.display = 'block'; setProgress(0); };
  const hideProgress = () => { $('sps-progress-wrap').style.display = 'none'; };
  const fmtMoney = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum   = n => Number(n || 0).toLocaleString('en-US');
  const fmtDateLabel = d => dates.formatLongDate(d);

  // 4. fetchAll — all 5 endpoints in parallel; individual failures show a banner but don't abort
  async function fetchAll(date) {
    showProgress();
    $('sps-errors').innerHTML = '';
    $('sps-date-label').textContent = fmtDateLabel(date);

    const b = { start: date, end: date };

    const errors = [];
    let prog = 0;
    const tick = () => { prog += 20; setProgress(prog); };
    const safe = (promise, name) => promise
      .then(r => { tick(); return r; })
      .catch(e => { tick(); errors.push(`${name}: ${e.message}`); log(`Error ${name}`, e); return null; });

    log(`Fetching 5 endpoints for ${date}`);

    const [summary, dispensers, byLocation, byHour, byBucket] = await Promise.all([
      safe(post('/api/Report/Summary',                   b),                          'Summary'),
      safe(post('/api/Report/EarningsAtDispenser',       b),                          'EarningsAtDispenser'),
      safe(post('/api/Report/BallsDispensedByLocation',  b),                          'BallsDispensedByLocation'),
      safe(post('/api/Report/BallsDispensedByHour',      { ...b, getMinutes: false }), 'BallsDispensedByHour'),
      safe(post('/api/Report/TotalsByBucketSize',        b),                          'TotalsByBucketSize'),
    ]);

    hideProgress();

    if (errors.length) {
      $('sps-errors').innerHTML = '<div style="padding:0 0 4px;">' +
        errors.map(e =>
          `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:10px 14px;margin:8px 0;border-radius:0 6px 6px 0;font-size:12px;color:#991b1b;">❌ Failed to load: ${escHtml(e)}</div>`
        ).join('') +
        '</div>';
    }

    log('Raw response samples', {
      summary:     summary?.model?.[0]    ?? summary?.models?.[0]    ?? summary?.model,
      dispensers:  dispensers?.models?.[0],
      byLocation:  byLocation?.models?.[0],
      byHour:      byHour?.models?.[0],
      byBucket:    byBucket?.models?.[0],
    });

    return { summary, dispensers, byLocation, byHour, byBucket };
  }

  // 5. render
  function render({ summary, dispensers, byLocation, byHour, byBucket }) {
    destroyCharts();

    const dispenserModels = dispensers?.models ?? [];
    const dispenserIncome = dispenserModels.reduce(
      (s, r) => s + Number(r.amount ?? (r.price ?? 0) * (r.quantity ?? 1)), 0
    );
    const summaryRow = Array.isArray(summary?.model)  ? summary.model[0]
                     : Array.isArray(summary?.models) ? summary.models[0]
                     : (summary?.model ?? {});
    const totalBalls = Number(summaryRow?.totalBallsDispensed ?? 0);
    const bucketModels   = byBucket?.models ?? [];
    const totalBucketQty = bucketModels.reduce((s, r) => s + Number(r.count ?? r.quantity ?? 0), 0);
    const totalBucketRev = bucketModels.reduce((s, r) => s + Number(r.amount ?? r.revenue ?? 0), 0);

    log('KPIs', { dispenserIncome, totalBalls, totalBucketQty, totalBucketRev });

    const kpiCard = (big, label, sub) => `
<div class="sps-kpi" style="background:#fff;border:1px solid #d1d5db;border-left:4px solid #eeb02b;border-radius:12px;padding:20px 24px;box-shadow:0 2px 8px rgba(0,0,0,0.06);flex:1;min-width:200px;">
  <div style="font-size:28px;font-weight:800;color:#262b2f;font-family:'Trebuchet MS',sans-serif;white-space:nowrap;">${big}</div>
  <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;">${escHtml(label)}</div>
  ${sub ? `<div style="font-size:12px;color:#9ca3af;margin-top:2px;">${escHtml(sub)}</div>` : ''}
</div>`;
    const chartCard = (title, canvasId, height) => `
<div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
  <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:12px;">${escHtml(title)}</div>
  <div style="position:relative;height:${height ?? '220px'};"><canvas id="${canvasId}"></canvas></div>
</div>`;

    $('sps-body').innerHTML = `
<div class="sps-kpi-row" style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
  ${kpiCard(fmtMoney(dispenserIncome), 'Dispenser Income', 'Today')}
  ${kpiCard(fmtNum(totalBalls),        'Balls Dispensed',  'combined LEFT + RIGHT')}
  ${kpiCard(fmtNum(totalBucketQty),    'Buckets Sold',     fmtMoney(totalBucketRev) + ' revenue')}
</div>
<div id="sps-top-grid" style="margin-bottom:20px;">
  ${chartCard('Balls Dispensed — LEFT vs RIGHT', 'sps-donut')}
  ${chartCard('Balls Dispensed — by Station',    'sps-station-bar')}
</div>
<div style="margin-bottom:20px;">${chartCard('Balls Dispensed — by Hour', 'sps-hourly-bar', '200px')}</div>
<div id="sps-bucket-grid">
  ${chartCard('Bucket Sales — by Size', 'sps-bucket-bar', '200px')}
  <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
    <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:12px;">Bucket Sales — Detail</div>
    <div id="sps-bucket-table"></div>
  </div>
</div>`;

    // Station color map
    const STATION_NAME_COLORS = { 'LEFT': '#0d9488', 'RIGHT': '#ea580c' };
    const FALLBACK_PALETTE    = ['#8b5cf6', '#06b6d4', '#ec4899', '#84cc16', '#f97316'];
    function stationColor(name, idx) {
      return STATION_NAME_COLORS[name] ?? FALLBACK_PALETTE[idx % FALLBACK_PALETTE.length];
    }

    // Charts 1 & 2: BallsDispensedByLocation
    const locModels = byLocation?.models ?? [];
    if (locModels.length) {
      const locLabels = locModels.map(r => r.key ?? r.stationName ?? r.name ?? '?');
      const locVals   = locModels.map(r => Number(r.value ?? r.totalBalls ?? r.count ?? 0));
      const locColors = locModels.map((r, i) => stationColor(r.key ?? r.stationName ?? '', i));
      const locTotal  = locVals.reduce((a, b) => a + b, 0);

      state.charts.donut = new Chart($('sps-donut'), {
        type: 'doughnut',
        data: { labels: locLabels, datasets: [{ data: locVals, backgroundColor: locColors, borderWidth: 2, borderColor: '#f8fafc' }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '62%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                font: { size: 12 }, padding: 14,
                generateLabels: chart => chart.data.labels.map((label, i) => ({
                  text: `${label}  ${fmtNum(locVals[i])}  (${locTotal > 0 ? (locVals[i] / locTotal * 100).toFixed(1) : '0.0'}%)`,
                  fillStyle: locColors[i], strokeStyle: locColors[i], lineWidth: 0, hidden: false, index: i,
                })),
              },
            },
            tooltip: { callbacks: { label: ctx => { const pct = locTotal > 0 ? (ctx.parsed / locTotal * 100).toFixed(1) : '0.0'; return ` ${fmtNum(ctx.parsed)} balls (${pct}%)`; } } },
          },
        },
        plugins: [{
          id: 'sps-center-label',
          afterDraw(chart) {
            const { ctx, chartArea: { left, top, width, height } } = chart;
            ctx.save();
            ctx.font = 'bold 18px "Trebuchet MS", sans-serif';
            ctx.fillStyle = '#262b2f';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(fmtNum(locTotal), left + width / 2, top + height / 2);
            ctx.restore();
          },
        }],
      });

      state.charts.stationBar = new Chart($('sps-station-bar'), {
        type: 'bar',
        data: { labels: locLabels, datasets: [{ data: locVals, backgroundColor: locColors, borderRadius: 6 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#e2e8f0' } }, x: { ticks: { font: { size: 11 } }, grid: { display: false } } },
        },
      });
    }

    // Chart 3: BallsDispensedByHour
    const hourModels  = byHour?.models ?? [];
    const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
                         '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];
    const parseHourKey = key => {
      const m = /^(\d{1,2})(AM|PM)$/i.exec(String(key ?? '').trim());
      if (!m) return -1;
      let h = parseInt(m[1], 10);
      const pm = m[2].toUpperCase() === 'PM';
      if (pm && h !== 12) h += 12;
      if (!pm && h === 12) h = 0;
      return h;
    };
    if (hourModels.length) {
      const hoursData = new Array(24).fill(0);
      hourModels.forEach(r => {
        const h = parseHourKey(r.key);
        if (h >= 0 && h < 24) hoursData[h] += Number(r.value ?? r.totalBalls ?? r.count ?? 0);
      });
      state.charts.hourlyBar = new Chart($('sps-hourly-bar'), {
        type: 'bar',
        data: { labels: HOUR_LABELS, datasets: [{ data: hoursData, backgroundColor: '#eeb02b', borderRadius: 3 }] },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { font: { size: 10 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#e2e8f0' } } },
        },
      });
    }

    // Chart 4 + table: TotalsByBucketSize
    const BUCKET_NAME_MAP = { 'Small': 'Warm Up', 'Medium': 'Large', 'Large': 'Jumbo', 'Jumbo': 'Mega' };
    const BUCKET_AMBER    = ['#fde68a', '#f59e0b', '#b45309', '#78350f'];
    if (bucketModels.length) {
      const sorted  = [...bucketModels].sort((a, b) => Number(a.size ?? 999) - Number(b.size ?? 999));
      const bLabels = sorted.map(r => { const raw = r.bucketSize ?? r.keyCaption ?? r.name ?? 'Unknown'; return BUCKET_NAME_MAP[raw] ?? raw; });
      const bQtys   = sorted.map(r => Number(r.count ?? r.quantity ?? 0));
      const bRevs   = sorted.map(r => Number(r.amount ?? r.revenue ?? 0));
      const bColors = sorted.map((_, i) => BUCKET_AMBER[i % BUCKET_AMBER.length]);

      state.charts.bucketBar = new Chart($('sps-bucket-bar'), {
        type: 'bar',
        data: { labels: bLabels, datasets: [{ data: bQtys, backgroundColor: bColors, borderRadius: 4 }] },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true, ticks: { font: { size: 11 } }, grid: { color: '#e2e8f0' } }, y: { ticks: { font: { size: 11 } }, grid: { display: false } } },
        },
      });

      // Intentionally denser table style than theme.TD/TH — snapshot context
      const TD = 'padding:8px 10px;border:none;border-bottom:1px solid #e2e8f0;font-size:12px;';
      const TH = 'padding:8px 10px;border:none;border-bottom:1px solid #d1d5db;font-size:11px;font-weight:700;color:#262b2f;text-align:left;';
      let tbl = `<table style="width:100%;border-collapse:collapse;"><thead><tr>
  <th style="${TH}">Bucket</th>
  <th style="${TH}text-align:right;">Qty</th>
  <th style="${TH}text-align:right;">%</th>
  <th style="${TH}text-align:right;">Revenue</th>
</tr></thead><tbody>`;
      sorted.forEach((_, i) => {
        const pct = totalBucketQty > 0 ? (bQtys[i] / totalBucketQty * 100).toFixed(1) : '0.0';
        tbl += `<tr>
  <td style="${TD}">${escHtml(bLabels[i])}</td>
  <td style="${TD}text-align:right;">${fmtNum(bQtys[i])}</td>
  <td style="${TD}text-align:right;">${pct}%</td>
  <td style="${TD}text-align:right;">${fmtMoney(bRevs[i])}</td>
</tr>`;
      });
      tbl += `<tr style="font-weight:700;background:#f8fafc;">
  <td style="${TD}">Total</td>
  <td style="${TD}text-align:right;">${fmtNum(totalBucketQty)}</td>
  <td style="${TD}text-align:right;">100%</td>
  <td style="${TD}text-align:right;">${fmtMoney(totalBucketRev)}</td>
</tr></tbody></table>`;
      $('sps-bucket-table').innerHTML = tbl;
    }
  }

  // 6. load — resets body, destroys charts, fetches, then renders
  async function load(date) {
    $('sps-body').innerHTML = '<div style="text-align:center;padding:48px;color:#64748b;font-size:14px;">Loading…</div>';
    destroyCharts();
    const data = await fetchAll(date);
    render(data);
  }

  // 7. Wire events
  $('sps-refresh').onclick = () => load($('sps-date').value);
  $('sps-date').onchange   = () => load($('sps-date').value);

  // 8. Initial load
  load(todayStr);

})();
