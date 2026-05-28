(function MerchantOSSnapshotUI() {
  if (document.getElementById('ls-snapshot-overlay')) return;

  const { escHtml, makeLogger, createModal, apiClient, paginate, dates, dom, runPreflight, SkylinksError, config } = window.SkylinksUtils;

  const ACCOUNT_ID = window.location.pathname.match(/\/Account\/(\d+)/)?.[1] || config.lightspeed.fallbackAccountId;
  const SHOP_ID    = config.lightspeed.shopId;
  const PAGE_SIZE  = config.lightspeed.pagination.pageSize;
  const PAGE_GUARD = config.lightspeed.pagination.pageGuard;
  const log   = makeLogger('LS Snapshot');
  const toArr = v => dom.toArr(v);

  const api = apiClient({
    baseUrl: `https://us.merchantos.com/API/Account/${ACCOUNT_ID}`,
    auth: 'cookie',
    retry: { attempts: 2, delayMs: 1000, methods: ['GET'] },
  });

  // ── State ──────────────────────────────────────────────────────────────────
  const todayStr = dates.todayLocal();

  const state = {
    date: todayStr,
    anchor: 'fourWeekAvg',
    cache: new Map(),
    charts: {},
    categoryMap: null,
    discountMap: null,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const fmtMoney = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum   = n => Number(n || 0).toLocaleString('en-US');
  const fmtPct   = n => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';

  function pacificHour(isoStr) {
    return parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(new Date(isoStr)),
      10
    );
  }
  function currentPacificHour() {
    return parseInt(
      new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', hour12: false }).format(new Date()),
      10
    );
  }

  function weekdayName(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
  }
  function weekdayShort(dateStr) {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
  }

  function anchorLabel(anchor, dateStr) {
    if (anchor === 'yesterday')    return 'Yesterday';
    if (anchor === 'lastWeekday')  return `Last ${weekdayShort(dateStr)}`;
    if (anchor === 'fourWeekAvg')  return `4-wk ${weekdayShort(dateStr)} avg`;
    return '';
  }

  function baselineDates(selectedDate, anchor) {
    if (anchor === 'yesterday')   return [dates.addDays(selectedDate, -1)];
    if (anchor === 'lastWeekday') return [dates.addDays(selectedDate, -7)];
    if (anchor === 'fourWeekAvg') return [
      dates.addDays(selectedDate, -7),
      dates.addDays(selectedDate, -14),
      dates.addDays(selectedDate, -21),
      dates.addDays(selectedDate, -28),
    ];
    return [];
  }

  function destroyCharts() {
    Object.values(state.charts).forEach(c => { try { c.destroy(); } catch (_) {} });
    state.charts = {};
  }

  // ── DOM shell ──────────────────────────────────────────────────────────────
  document.getElementById('lss-responsive')?.remove();
  const styleEl = document.createElement('style');
  styleEl.id = 'lss-responsive';
  styleEl.textContent = `
    #lss-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-bottom:20px; }
    #lss-charts-grid { display:grid; grid-template-columns:3fr 2fr; gap:18px; margin-bottom:18px; }
    @media (max-width:900px) {
      #lss-kpi-row { grid-template-columns:1fr 1fr; }
      #lss-charts-grid { grid-template-columns:1fr; }
    }
    @media (max-width:540px) { #lss-kpi-row { grid-template-columns:1fr; } }
    .lss-anchor-btn.lss-active { background:#1c1b19 !important; color:#eeb02b !important; }
    .lss-anchor-btn:hover:not(.lss-active) { background:#fef9ec !important; }
  `;
  document.head.appendChild(styleEl);

  const BODY_HTML = `
<div style="background:#eeb02b;padding:16px 24px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;margin:-28px -32px 20px;border-radius:14px 14px 0 0;">
  <div>
    <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',sans-serif;color:#1c1b19;">Daily Snapshot — Lightspeed Retail</h2>
    <p id="lss-date-label" style="margin:4px 0 0;font-size:13px;color:#3d3800;"></p>
  </div>
  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <input id="lss-date" type="date" value="${todayStr}" max="${todayStr}"
      style="padding:7px 10px;border:1.5px solid #d1a800;border-radius:8px;font-size:13px;background:#fff;color:#262b2f;outline:none;" />
    <div style="display:flex;border:1.5px solid #d1a800;border-radius:8px;overflow:hidden;font-size:12px;font-weight:700;">
      <button data-anchor="yesterday"   class="lss-anchor-btn" style="padding:7px 11px;background:#fff;border:none;border-right:1px solid #d1a800;cursor:pointer;color:#262b2f;">Yesterday</button>
      <button data-anchor="lastWeekday" class="lss-anchor-btn" style="padding:7px 11px;background:#fff;border:none;border-right:1px solid #d1a800;cursor:pointer;color:#262b2f;">Last <span id="lss-wd-label">—</span></button>
      <button data-anchor="fourWeekAvg" class="lss-anchor-btn" style="padding:7px 11px;background:#fff;border:none;cursor:pointer;color:#262b2f;">4-wk Avg</button>
    </div>
    <button id="lss-refresh" style="background:#1c1b19;color:#eeb02b;border:none;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:'Segoe UI',sans-serif;">Refresh</button>
  </div>
</div>
<div id="lss-progress-wrap" style="display:none;margin:0 -32px 16px;">
  <div style="background:#e2e8f0;height:4px;overflow:hidden;">
    <div id="lss-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .25s;"></div>
  </div>
</div>
<div id="lss-errors"></div>
<div id="lss-body" style="padding-top:4px;"><div style="text-align:center;padding:48px;color:#64748b;font-size:14px;">Loading…</div></div>`;

  const modal = createModal({
    id: 'ls-snapshot',
    title: '',
    runLabel: null,
    variant: 'wide',
    body: BODY_HTML,
    onClose: () => {
      destroyCharts();
      document.getElementById('lss-responsive')?.remove();
    },
  });
  modal.card.style.width = '1100px';

  const $ = id => document.getElementById(id);

  const showProgress = ()  => { $('lss-progress-wrap').style.display = 'block'; $('lss-bar').style.width = '0%'; };
  const setProgress  = pct => { $('lss-bar').style.width = pct + '%'; };
  const hideProgress = ()  => { $('lss-progress-wrap').style.display = 'none'; };

  function updateHeaderUI() {
    document.querySelectorAll('.lss-anchor-btn').forEach(btn => {
      btn.classList.toggle('lss-active', btn.dataset.anchor === state.anchor);
    });
    $('lss-wd-label').textContent = weekdayShort(state.date);
    let label = dates.formatLongDate(state.date);
    if (state.date === todayStr) {
      const h = currentPacificHour();
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      label += ` · as of ${h12}:00 ${ampm}`;
    }
    $('lss-date-label').textContent = label;
  }

  function showError(msg, fatal = false) {
    const c = fatal ? '#dc2626' : '#92400e';
    const bg = fatal ? '#fef2f2' : '#fffbeb';
    const b  = fatal ? '#dc2626' : '#d97706';
    $('lss-errors').insertAdjacentHTML('beforeend',
      `<div style="background:${bg};border-left:4px solid ${b};padding:10px 14px;margin:0 0 10px;border-radius:0 6px 6px 0;font-size:12px;color:${c};">${escHtml(msg)}</div>`
    );
  }

  // ── Meta fetch (categories + discounts, loaded once per session) ───────────
  async function loadMeta() {
    if (state.categoryMap && state.discountMap) return;
    const [activeDisc, archivedDisc, cats, emps] = await Promise.all([
      paginate({ fetchPage: cur => api.get(`/Discount.json?limit=${PAGE_SIZE}&archived=false&offset=${cur}`),  getItems: r => toArr(r.Discount),  getTotal: r => parseInt(r['@attributes']?.count || '0', 10), pageSize: PAGE_SIZE, parallel: true }),
      paginate({ fetchPage: cur => api.get(`/Discount.json?limit=${PAGE_SIZE}&archived=true&offset=${cur}`),   getItems: r => toArr(r.Discount),  getTotal: r => parseInt(r['@attributes']?.count || '0', 10), pageSize: PAGE_SIZE, parallel: true }),
      paginate({ fetchPage: cur => api.get(`/Category.json?limit=${PAGE_SIZE}&offset=${cur}`),                 getItems: r => toArr(r.Category),  getTotal: r => parseInt(r['@attributes']?.count || '0', 10), pageSize: PAGE_SIZE, parallel: true }),
      paginate({ fetchPage: cur => api.get(`/Employee.json?limit=${PAGE_SIZE}&offset=${cur}`),                 getItems: r => toArr(r.Employee),  getTotal: r => parseInt(r['@attributes']?.count || '0', 10), pageSize: PAGE_SIZE, parallel: true }),
    ]);
    state.discountMap = {};
    [...activeDisc, ...archivedDisc].forEach(d => {
      state.discountMap[d.discountID] = d.archived === 'true' ? `${d.name} [ARCHIVED]` : d.name;
    });
    state.categoryMap = {};
    cats.forEach(c => { state.categoryMap[c.categoryID] = { name: c.name, parentID: c.parentID }; });
    state.employeeMap = {};
    emps.forEach(e => { state.employeeMap[e.employeeID] = `${e.firstName || ''} ${e.lastName || ''}`.trim(); });
    log(`Meta loaded: ${activeDisc.length + archivedDisc.length} discounts, ${cats.length} categories, ${emps.length} employees`);
  }

  // ── Fetch raw sales for one date ───────────────────────────────────────────
  async function fetchSalesForDate(dateStr) {
    const { start: s, end: e } = dates.pacificDayUTCWindow(dateStr);
    const tf   = encodeURIComponent(`><,${s},${e}`);
    const rels = encodeURIComponent('["SaleLines","SaleLines.Item","Customer"]');
    let pages = 0;
    const sales = await paginate({
      fetchPage: cur => {
        if (++pages > PAGE_GUARD) throw new Error(`Pagination guard hit for ${dateStr}`);
        return api.get(`/Sale.json?completed=true&completeTime=${tf}&shopID=${SHOP_ID}&load_relations=${rels}&limit=${PAGE_SIZE}&offset=${cur}`);
      },
      getItems: r => toArr(r.Sale),
      getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
      pageSize: PAGE_SIZE, parallel: true,
    });
    log(`Fetched ${sales.length} sales for ${dateStr}`);
    return sales;
  }

  // ── Aggregate raw sales → dashboard data ──────────────────────────────────
  function aggregate(sales, clipHour = null) {
    const kpis = { grossSales: 0, transactions: 0, totalDiscount: 0, refundTotal: 0 };
    const byHour    = new Array(24).fill(0);
    const byDept    = {};
    const discAgg   = {};
    const refunds   = [];

    for (const sale of sales) {
      const pHour    = pacificHour(sale.completeTime);
      if (clipHour !== null && pHour > clipHour) continue;

      const saleTotal = parseFloat(sale.calcTotal) || 0;
      const isRefund  = sale.saleType === 'Return' || saleTotal < 0;

      if (isRefund) {
        const emp = state.employeeMap?.[sale.employeeID] || '';
        refunds.push({
          saleID: sale.saleID, time: sale.completeTime,
          amount: saleTotal, refundFor: sale.refundFor || '',
          note: sale.note || '', employee: emp,
        });
        kpis.refundTotal += saleTotal;
      } else {
        kpis.grossSales += saleTotal;
        kpis.transactions++;
        byHour[pHour] = (byHour[pHour] || 0) + saleTotal;
      }

      for (const line of toArr(sale.SaleLines?.SaleLine)) {
        const disc = parseFloat(line.calcLineDiscount) || 0;
        if (disc > 0) kpis.totalDiscount += disc;

        if (!isRefund) {
          const cat      = state.categoryMap?.[line.Item?.categoryID];
          const deptName = cat
            ? (cat.parentID && cat.parentID !== '0'
                ? (state.categoryMap[cat.parentID]?.name || cat.name)
                : cat.name)
            : 'Uncategorized';
          if (!byDept[deptName]) byDept[deptName] = { revenue: 0 };
          byDept[deptName].revenue += parseFloat(line.calcTotal) || 0;
        }

        if (disc > 0 && line.discountID && line.discountID !== '0') {
          const dName = state.discountMap?.[line.discountID] || `Unknown (ID:${line.discountID})`;
          if (!discAgg[dName]) discAgg[dName] = { qty: 0, total: 0 };
          discAgg[dName].qty++;
          discAgg[dName].total += disc;
        }
      }
    }

    kpis.avgTicket  = kpis.transactions > 0 ? kpis.grossSales / kpis.transactions : 0;
    kpis.netRevenue = kpis.grossSales + kpis.refundTotal;
    return { kpis, byHour, byDept, discAgg, refunds };
  }

  // ── Average 4 aggregations for the 4-wk anchor ────────────────────────────
  function averageAggs(aggs) {
    const n = aggs.length;
    if (!n) return null;
    const out = { kpis: {}, byHour: new Array(24).fill(0), byDept: {}, discAgg: {}, refunds: [] };
    ['grossSales','transactions','totalDiscount','refundTotal','avgTicket','netRevenue'].forEach(k => {
      out.kpis[k] = aggs.reduce((s, a) => s + (a.kpis[k] || 0), 0) / n;
    });
    for (let h = 0; h < 24; h++) out.byHour[h] = aggs.reduce((s, a) => s + (a.byHour[h] || 0), 0) / n;
    out._hourlyMin = Array.from({ length: 24 }, (_, h) => Math.min(...aggs.map(a => a.byHour[h] || 0)));
    out._hourlyMax = Array.from({ length: 24 }, (_, h) => Math.max(...aggs.map(a => a.byHour[h] || 0)));
    const allDepts = new Set(aggs.flatMap(a => Object.keys(a.byDept)));
    allDepts.forEach(d => { out.byDept[d] = { revenue: aggs.reduce((s, a) => s + (a.byDept[d]?.revenue || 0), 0) / n }; });
    const allDisc = new Set(aggs.flatMap(a => Object.keys(a.discAgg)));
    allDisc.forEach(k => {
      out.discAgg[k] = {
        qty:   aggs.reduce((s, a) => s + (a.discAgg[k]?.qty   || 0), 0) / n,
        total: aggs.reduce((s, a) => s + (a.discAgg[k]?.total || 0), 0) / n,
      };
    });
    return out;
  }

  // ── Compare a KPI pair ─────────────────────────────────────────────────────
  function compareKpi(todayVal, baseVal) {
    if (baseVal === undefined || baseVal === null) return null;
    const pct = baseVal !== 0 ? (todayVal - baseVal) / Math.abs(baseVal) * 100 : null;
    const dir = pct === null ? 'neutral' : Math.abs(pct) <= 2 ? 'neutral' : pct > 0 ? 'up' : 'down';
    return { today: todayVal, baseline: baseVal, pct, dir };
  }

  // ── Delta chip HTML ────────────────────────────────────────────────────────
  function deltaChip(delta, label, isMoney = true) {
    if (!delta) return `<span style="color:#9ca3af;font-style:italic;font-size:11px;">— no comparison data —</span>`;
    const { pct, baseline, dir } = delta;
    const pctStr    = pct !== null ? (pct >= 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`) : '—';
    const arrow     = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '●';
    const color     = dir === 'up' ? '#16a34a' : dir === 'down' ? '#dc2626' : '#9ca3af';
    const bg        = dir === 'up' ? '#f0fdf4' : dir === 'down' ? '#fef2f2' : '#f9fafb';
    const baseStr   = isMoney ? fmtMoney(baseline) : fmtNum(Math.round(baseline));
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;background:${bg};color:${color};font-weight:700;font-size:11px;">${arrow} ${pctStr} vs ${escHtml(label)} (${baseStr})</span>`;
  }

  // ── Exception flags ────────────────────────────────────────────────────────
  function evaluateExceptions(todayAgg, baselineAgg) {
    const flags = [];
    if (baselineAgg) {
      const td = todayAgg.kpis.totalDiscount, bd = baselineAgg.kpis.totalDiscount;
      if (td >= 50 && bd > 0 && td >= bd * 2)
        flags.push(`⚠️ Discount total is ${(td / bd).toFixed(1)}× baseline (${fmtMoney(td)} vs ${fmtMoney(bd)})`);
      const tr = todayAgg.refunds.length, br = baselineAgg.refunds.length;
      if (tr >= 3 && br > 0 && tr >= br * 3)
        flags.push(`⚠️ ${tr} refunds today — ${(tr / br).toFixed(1)}× baseline avg of ${br.toFixed(1)}`);
    }
    const archived = Object.keys(todayAgg.discAgg).filter(d => d.includes('[ARCHIVED]'));
    if (archived.length)
      flags.push(`⚠️ Archived discount applied: ${archived.join(', ')}`);
    return flags;
  }

  // ── Table style constants ──────────────────────────────────────────────────
  const TD = 'padding:8px 10px;border:none;border-bottom:1px solid #e2e8f0;font-size:12px;';
  const TH = 'padding:8px 10px;border:none;border-bottom:2px solid #d1d5db;font-size:11px;font-weight:700;color:#374151;text-align:left;';

  // ── KPI card HTML ──────────────────────────────────────────────────────────
  function kpiCard(chipId, big, label) {
    return `<div style="background:#fff;border:1px solid #d1d5db;border-left:4px solid #eeb02b;border-radius:12px;padding:18px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
  <div style="font-size:28px;font-weight:800;color:#262b2f;font-family:'Trebuchet MS',sans-serif;white-space:nowrap;">${big}</div>
  <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-top:4px;">${escHtml(label)}</div>
  <div id="${chipId}" style="margin-top:8px;min-height:20px;font-size:12px;"><span style="color:#d1d5db;font-size:11px;">Loading…</span></div>
</div>`;
  }

  // ── Render: today's data only ──────────────────────────────────────────────
  const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
                       '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];

  function renderToday(todayAgg) {
    destroyCharts();
    const { kpis, byHour, byDept, discAgg, refunds } = todayAgg;

    $('lss-body').innerHTML = `
<div id="lss-kpi-row">
  ${kpiCard('chip-gross', fmtMoney(kpis.grossSales),  'Gross Sales · Today')}
  ${kpiCard('chip-txn',   fmtNum(kpis.transactions),  'Transactions')}
  ${kpiCard('chip-avg',   fmtMoney(kpis.avgTicket),   'Avg Ticket')}
  ${kpiCard('chip-net',   fmtMoney(kpis.netRevenue),  'Net Revenue')}
</div>
<div id="lss-exceptions" style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
  <span style="color:#9ca3af;font-size:12px;font-style:italic;">Checking for exceptions…</span>
</div>
<div style="margin-bottom:18px;background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
  <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:12px;">Hourly Sales</div>
  <div style="position:relative;height:220px;"><canvas id="lss-hourly"></canvas></div>
</div>
<div id="lss-charts-grid">
  <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
    <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:12px;">Sales by Department</div>
    <div style="position:relative;height:260px;"><canvas id="lss-dept"></canvas></div>
  </div>
  <div style="background:#f8fafc;border-radius:12px;padding:20px;border:1px solid #e2e8f0;">
    <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:12px;">Department Detail</div>
    <div id="lss-dept-table"></div>
  </div>
</div>
<div style="margin-bottom:18px;">
  <div style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:10px;">Discounts Applied</div>
  <div id="lss-disc-table"></div>
</div>
<div>
  <div id="lss-refunds-header" style="font-size:13px;font-weight:700;color:#262b2f;margin-bottom:10px;">Refunds &amp; Voids</div>
  <div id="lss-refunds-table"></div>
</div>`;

    // Hourly chart — today bars only (baseline line added later)
    const isToday     = state.date === todayStr;
    const nowHour     = isToday ? currentPacificHour() : 25;
    const barColors   = byHour.map((_, h) => h > nowHour ? '#e5e7eb' : '#eeb02b');

    state.charts.hourly = new Chart($('lss-hourly'), {
      type: 'bar',
      data: {
        labels: HOUR_LABELS,
        datasets: [{ label: 'Today', data: [...byHour], backgroundColor: barColors, borderRadius: 3, order: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
        scales: {
          x: { ticks: { font: { size: 10 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#e2e8f0' } },
        },
      },
    });

    // Department chart — today only; baseline bars added later
    const deptEntries = Object.entries(byDept).sort((a, b) => b[1].revenue - a[1].revenue);
    state._deptEntries = deptEntries;

    state.charts.dept = new Chart($('lss-dept'), {
      type: 'bar',
      data: {
        labels: deptEntries.map(([k]) => k),
        datasets: [{ label: 'Today', data: deptEntries.map(([, v]) => v.revenue), backgroundColor: '#eeb02b', borderRadius: 4 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => fmtMoney(ctx.raw) } } },
        scales: {
          x: { beginAtZero: true, ticks: { font: { size: 11 }, callback: v => '$' + v.toLocaleString() }, grid: { color: '#e2e8f0' } },
          y: { ticks: { font: { size: 11 } }, grid: { display: false } },
        },
      },
    });

    renderDeptTable(deptEntries, null);
    renderDiscTable(discAgg, null);
    renderRefundsTable(refunds);
  }

  // ── Render: apply baseline overlays + delta chips ─────────────────────────
  function applyBaseline(todayAgg, baselineAgg) {
    const label = anchorLabel(state.anchor, state.date);

    // Delta chips
    const kpiDefs = [
      { id: 'chip-gross', key: 'grossSales',  money: true  },
      { id: 'chip-txn',   key: 'transactions', money: false },
      { id: 'chip-avg',   key: 'avgTicket',   money: true  },
      { id: 'chip-net',   key: 'netRevenue',  money: true  },
    ];
    kpiDefs.forEach(({ id, key, money }) => {
      const el = $(id); if (!el) return;
      const delta = baselineAgg ? compareKpi(todayAgg.kpis[key], baselineAgg.kpis[key]) : null;
      el.innerHTML = deltaChip(delta, label, money);
    });

    // Exception strip
    const flags = evaluateExceptions(todayAgg, baselineAgg);
    const excEl = $('lss-exceptions');
    if (excEl) {
      if (!flags.length) {
        excEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#f0fdf4;color:#16a34a;font-size:12px;font-weight:700;">✅ No exceptions detected</span>`;
      } else {
        const visible = flags.slice(0, 5);
        const extra   = flags.length - visible.length;
        excEl.innerHTML = visible.map(f =>
          `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#fffbeb;border:1px solid #fde68a;color:#92400e;font-size:12px;font-weight:600;">${escHtml(f)}</span>`
        ).join('') + (extra > 0 ? `<span style="padding:5px 12px;border-radius:999px;background:#f1f5f9;color:#64748b;font-size:12px;">+${extra} more</span>` : '');
      }
    }

    if (!baselineAgg) return;

    // Overlay baseline line on hourly chart
    if (state.charts.hourly) {
      const ds = state.charts.hourly.data.datasets;
      ds.push({
        label: label, data: [...baselineAgg.byHour],
        type: 'line', borderColor: '#6b7280', borderDash: [5, 4],
        borderWidth: 2, pointRadius: 0, fill: false, tension: 0.3, order: 1,
      });
      if (state.anchor === 'fourWeekAvg' && baselineAgg._hourlyMin) {
        ds.push({
          label: '_band_lo', data: [...baselineAgg._hourlyMin],
          type: 'line', borderColor: 'transparent',
          backgroundColor: 'rgba(107,114,128,0.10)', fill: '+1',
          pointRadius: 0, tension: 0.3, order: 3,
        });
        ds.push({
          label: '_band_hi', data: [...baselineAgg._hourlyMax],
          type: 'line', borderColor: 'transparent',
          backgroundColor: 'rgba(107,114,128,0.10)', fill: false,
          pointRadius: 0, tension: 0.3, order: 3,
        });
      }
      state.charts.hourly.options.plugins.legend.display = true;
      state.charts.hourly.update();
    }

    // Add baseline bars to department chart
    if (state.charts.dept && state._deptEntries) {
      const deptLabels = state._deptEntries.map(([k]) => k);
      const todayVals  = state._deptEntries.map(([, v]) => v.revenue);
      const baseVals   = deptLabels.map(d => baselineAgg.byDept[d]?.revenue || 0);
      state.charts.dept.data.datasets = [
        { label: 'Today',  data: todayVals, backgroundColor: '#eeb02b', borderRadius: 4 },
        { label: label,    data: baseVals,  backgroundColor: 'rgba(107,114,128,0.45)', borderRadius: 4 },
      ];
      state.charts.dept.options.plugins.legend.display = true;
      state.charts.dept.update();
      renderDeptTable(state._deptEntries, baselineAgg.byDept);
    }

    renderDiscTable(todayAgg.discAgg, baselineAgg.discAgg);
  }

  // ── Table renderers ────────────────────────────────────────────────────────
  function renderDeptTable(deptEntries, baseDept) {
    const el = $('lss-dept-table'); if (!el) return;
    const total = deptEntries.reduce((s, [, v]) => s + v.revenue, 0);
    const hasBL = !!baseDept;
    let html = `<table style="width:100%;border-collapse:collapse;"><thead><tr>
      <th style="${TH}">Dept</th><th style="${TH}text-align:right;">Today</th>
      ${hasBL ? `<th style="${TH}text-align:right;">Baseline</th><th style="${TH}text-align:right;">Δ</th>` : ''}
    </tr></thead><tbody>`;
    deptEntries.forEach(([dept, v]) => {
      const b    = baseDept?.[dept]?.revenue || 0;
      const diff = v.revenue - b;
      const dc   = !hasBL ? '' : diff > 0 ? 'color:#16a34a;' : diff < 0 ? 'color:#dc2626;' : '';
      html += `<tr>
        <td style="${TD}">${escHtml(dept)}</td>
        <td style="${TD}text-align:right;">${fmtMoney(v.revenue)}</td>
        ${hasBL ? `<td style="${TD}text-align:right;">${fmtMoney(b)}</td><td style="${TD}text-align:right;${dc}">${diff >= 0 ? '+' : ''}${fmtMoney(diff)}</td>` : ''}
      </tr>`;
    });
    const bSum = hasBL ? Object.values(baseDept).reduce((s, v) => s + (v.revenue || 0), 0) : 0;
    const tDiff = total - bSum;
    html += `<tr style="font-weight:700;background:#f8fafc;">
      <td style="${TD}">Total</td><td style="${TD}text-align:right;">${fmtMoney(total)}</td>
      ${hasBL ? `<td style="${TD}text-align:right;">${fmtMoney(bSum)}</td><td style="${TD}text-align:right;${tDiff >= 0 ? 'color:#16a34a;' : 'color:#dc2626;'}">${tDiff >= 0 ? '+' : ''}${fmtMoney(tDiff)}</td>` : ''}
    </tr></tbody></table>`;
    el.innerHTML = html;
  }

  function renderDiscTable(discAgg, baseDiscAgg) {
    const el = $('lss-disc-table'); if (!el) return;
    const entries = Object.entries(discAgg).sort((a, b) => b[1].total - a[1].total);
    if (!entries.length) {
      el.innerHTML = `<div style="color:#9ca3af;font-size:13px;padding:12px 0;">No discounts applied today.</div>`;
      return;
    }
    const hasBL = !!baseDiscAgg;
    let html = `<table style="width:100%;border-collapse:collapse;"><thead><tr>
      <th style="${TH}">Discount</th><th style="${TH}text-align:center;">Qty</th><th style="${TH}text-align:right;">Total</th>
      ${hasBL ? `<th style="${TH}text-align:right;">Δ vs Baseline</th>` : ''}
    </tr></thead><tbody>`;
    entries.forEach(([name, v]) => {
      const isMember  = name.includes('_X_') || name.toLowerCase().includes('membership');
      const isArchived = name.includes('[ARCHIVED]');
      const row = isMember ? 'background:#fffbeb;' : '';
      const bTotal = baseDiscAgg?.[name]?.total || 0;
      const diff   = v.total - bTotal;
      const cleanName = name.replace(' [ARCHIVED]', '');
      const archTag   = isArchived ? ` <span style="font-size:10px;color:#dc2626;font-weight:700;">[ARCHIVED]</span>` : '';
      html += `<tr style="${row}">
        <td style="${TD}">${escHtml(cleanName)}${archTag}</td>
        <td style="${TD}text-align:center;">${Math.round(v.qty)}</td>
        <td style="${TD}text-align:right;">${fmtMoney(v.total)}</td>
        ${hasBL ? `<td style="${TD}text-align:right;${diff > 0 ? 'color:#dc2626;' : 'color:#16a34a;'}">${diff >= 0 ? '+' : ''}${fmtMoney(diff)}</td>` : ''}
      </tr>`;
    });
    const grand = entries.reduce((s, [, v]) => s + v.total, 0);
    html += `<tr style="font-weight:700;background:#f8fafc;">
      <td style="${TD}">Total</td><td style="${TD}text-align:center;">${entries.reduce((s, [, v]) => s + Math.round(v.qty), 0)}</td>
      <td style="${TD}text-align:right;">${fmtMoney(grand)}</td>
      ${hasBL ? `<td style="${TD}"></td>` : ''}
    </tr></tbody></table>`;
    el.innerHTML = html;
  }

  function renderRefundsTable(refunds) {
    const el = $('lss-refunds-table'); if (!el) return;
    const header = $('lss-refunds-header');
    if (!refunds.length) {
      if (header) header.textContent = 'Refunds & Voids';
      el.innerHTML = `<div style="color:#16a34a;font-size:13px;padding:12px 0;">✅ No refunds today.</div>`;
      return;
    }
    if (header) header.textContent = `Refunds & Voids · ${refunds.length} today`;
    let html = `<table style="width:100%;border-collapse:collapse;"><thead><tr>
      <th style="${TH}">Time</th><th style="${TH}">Amount</th><th style="${TH}">Employee</th><th style="${TH}">Note</th><th style="${TH}">Orig. Sale</th>
    </tr></thead><tbody>`;
    refunds.forEach(r => {
      const timeStr = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(r.time));
      html += `<tr>
        <td style="${TD}">${timeStr}</td>
        <td style="${TD}color:#dc2626;font-weight:700;">${fmtMoney(r.amount)}</td>
        <td style="${TD}">${escHtml(r.employee)}</td>
        <td style="${TD}">${escHtml(r.note)}</td>
        <td style="${TD}">${r.refundFor ? escHtml(r.refundFor) : '—'}</td>
      </tr>`;
    });
    html += `</tbody></table>`;
    el.innerHTML = html;
  }

  // ── Cache-aware fetch + aggregate ─────────────────────────────────────────
  async function getAgg(dateStr, clipHour = null) {
    const cacheKey = clipHour !== null ? `${dateStr}@${clipHour}` : dateStr;
    if (dateStr !== todayStr && state.cache.has(cacheKey)) return state.cache.get(cacheKey);
    const sales = await fetchSalesForDate(dateStr);
    const agg   = aggregate(sales, clipHour);
    if (dateStr !== todayStr) state.cache.set(cacheKey, agg);
    return agg;
  }

  // ── Main load orchestration ────────────────────────────────────────────────
  let loadSeq = 0;

  async function load() {
    const seq          = ++loadSeq;
    const selectedDate = state.date;
    const selectedAnchor = state.anchor;

    $('lss-errors').innerHTML = '';
    destroyCharts();
    $('lss-body').innerHTML = `<div style="text-align:center;padding:48px;color:#64748b;font-size:14px;">Loading…</div>`;
    showProgress(); setProgress(5);

    // Preflight: verify auth + shop contract before heavy fetch pipeline
    try {
      await runPreflight({
        name:         'Lightspeed Shop',
        checkFn:      () => api.get('/Shop.json'),
        expectedKeys: ['@attributes', 'Shop'],
      });
    } catch (err) {
      hideProgress();
      showError(
        err.code === 'AUTH'
          ? 'Not authenticated. Please reload the page and log in to Lightspeed.'
          : 'Preflight check failed: ' + (err.detail || err.message),
        true
      );
      return;
    }

    try {
      await loadMeta();
    } catch (err) {
      showError('Failed to load categories/discounts: ' + err.message);
    }
    if (seq !== loadSeq) return;
    setProgress(15);

    // Fetch today's data
    let todayAgg;
    try {
      todayAgg = await getAgg(selectedDate);
    } catch (err) {
      if (seq !== loadSeq) return;
      hideProgress();
      $('lss-body').innerHTML = `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;border-radius:6px;color:#dc2626;">❌ Failed to load data: ${escHtml(err.message)}</div>`;
      return;
    }
    if (seq !== loadSeq) return;
    setProgress(50);
    renderToday(todayAgg);

    // Fetch baseline in parallel with rendering
    const isToday  = selectedDate === todayStr;
    const clipHour = isToday ? currentPacificHour() : null;
    const bDates   = baselineDates(selectedDate, selectedAnchor);
    try {
      let baselineAgg;
      if (bDates.length === 1) {
        baselineAgg = await getAgg(bDates[0], clipHour);
      } else {
        const aggs = await Promise.all(bDates.map(d => getAgg(d, clipHour)));
        baselineAgg = averageAggs(aggs);
      }
      if (seq !== loadSeq) return;
      setProgress(90);
      applyBaseline(todayAgg, baselineAgg);
    } catch (err) {
      if (seq !== loadSeq) return;
      showError('Comparison unavailable — baseline failed to load: ' + err.message);
      applyBaseline(todayAgg, null);
    }

    setProgress(100);
    setTimeout(hideProgress, 500);
  }

  // ── Event wiring ───────────────────────────────────────────────────────────
  $('lss-date').onchange = () => {
    state.date = $('lss-date').value;
    updateHeaderUI();
    load();
  };

  $('lss-refresh').onclick = () => {
    state.cache.delete(todayStr);
    load();
  };

  document.querySelectorAll('.lss-anchor-btn').forEach(btn => {
    btn.onclick = () => {
      state.anchor = btn.dataset.anchor;
      updateHeaderUI();
      load();
    };
  });

  // ── Init: auth check then load ─────────────────────────────────────────────
  (async () => {
    try {
      await api.get('/Sale.json?limit=1');
    } catch {
      alert('Skylinks Tools: Not logged into Lightspeed Retail, or session expired. Please log in and try again.');
      modal.close();
      return;
    }
    updateHeaderUI();
    load();
  })();

})();
