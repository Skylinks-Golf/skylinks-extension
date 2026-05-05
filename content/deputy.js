(function DeputyReportUI() {

  const BASE = 'https://348a3926020407.na.deputy.com';

  // OU_GROUPS consolidates the three separate OU tables (PROSHOP_OU_IDS, ADMIN_OU_IDS,
  // OU_FALLBACK_NAMES) into a single source of truth.
  const OU_GROUPS = [
    {
      category: 'Proshop',
      ids: new Set([1, 7, 8, 13, 17, 18, 19]),
      fallbackNames: { 1: 'Proshop', 7: 'Pro Shop', 8: 'Training', 13: 'Event Host', 17: 'Bev Cart', 18: 'Outside Services', 19: 'Kids Zone / Patio / Carts' },
    },
    {
      category: 'Admin',
      ids: new Set([6]),
      fallbackNames: { 6: 'Admin' },
    },
  ];
  const UNGROUPED_FALLBACK_NAMES = { 4: 'Course Crew' };

  const { escHtml, escCsv, makeLogger, createModal, apiClient, csv, download, copy, runReport, dates } = window.SkylinksUtils;
  const log = makeLogger('Deputy Report');

  const { monday: defaultStart, sunday: defaultEnd } = dates.weekRangeMonSun();

  const api = apiClient({
    baseUrl: BASE,
    auth: 'cookie',
  });

  const modal = createModal({
    id: 'dep',
    title: 'Weekly Hours Report',
    emoji: '🕐',
    description: 'Fetches all scheduled shifts from Deputy for a Monday–Sunday week and totals hours by area, grouped into Proshop and Admin categories.',
    fields: [
      { id: 'start', type: 'date', label: 'Week Start (Monday)', value: defaultStart },
      { id: 'end',   type: 'date', label: 'Week End (Sunday)',   value: defaultEnd },
    ],
    runLabel: 'Generate Report',
  });

  runReport({
    modal,
    validate: ({ start, end }) => {
      if (!start || !end) return 'Please select both a start and end date.';
      if (start > end) return 'Week start must be on or before week end.';
    },

    fetch: async ({ start: weekStart, end: weekEnd }, ctx) => {
      ctx.setStatus('Fetching areas and shifts…');
      log(`Starting report for ${weekStart} → ${weekEnd}`);

      const [ouData, rosterData] = await Promise.all([
        api.get('/api/v1/resource/OperationalUnit?max=100', { headers: { Accept: 'application/json' } }),
        api.post('/api/v1/resource/Roster/QUERY', {
          search: {
            s1: { field: 'Date', type: 'ge', data: weekStart },
            s2: { field: 'Date', type: 'le', data: weekEnd },
          },
          sort: { Date: 'asc' },
          start: 0,
          max: 500,
        }, { headers: { Accept: 'application/json' } }),
      ]);

      ctx.setProgress(60);

      // Build OU name map: group fallbacks → ungrouped fallbacks → API data
      const ouNameMap = {};
      OU_GROUPS.forEach(g => Object.assign(ouNameMap, g.fallbackNames));
      Object.assign(ouNameMap, UNGROUPED_FALLBACK_NAMES);
      if (Array.isArray(ouData)) {
        ouData.forEach(ou => { ouNameMap[ou.Id] = ou.OperationalUnitName; });
      }
      log(`Loaded ${Array.isArray(ouData) ? ouData.length : 0} operational units. ${rosterData.length} shifts returned.`);

      return { rosterData, ouNameMap };
    },

    process: ({ rosterData, ouNameMap }) => {
      const byGroup = {};
      OU_GROUPS.forEach(g => { byGroup[g.category] = {}; });
      const totals = {};
      OU_GROUPS.forEach(g => { totals[g.category] = 0; });

      for (const shift of rosterData) {
        const ouId = shift.OperationalUnit;
        const hrs  = shift.TotalTime || 0;
        const group = OU_GROUPS.find(g => g.ids.has(ouId));
        if (group) {
          byGroup[group.category][ouId] = (byGroup[group.category][ouId] || 0) + hrs;
          totals[group.category] += hrs;
        }
      }

      const makeRows = (category) =>
        Object.entries(byGroup[category])
          .map(([id, hrs]) => ({ id: parseInt(id), name: ouNameMap[id] || `Area ${id}`, category, hrs }))
          .sort((a, b) => b.hrs - a.hrs);

      const proshopRows   = makeRows('Proshop');
      const adminRows     = makeRows('Admin');
      const allAreaRows   = [...proshopRows, ...adminRows];
      const proshopTotal  = totals.Proshop;
      const adminTotal    = totals.Admin;
      const combinedTotal = proshopTotal + adminTotal;

      log(`Proshop: ${proshopTotal.toFixed(2)} h, Admin: ${adminTotal.toFixed(2)} h, Combined: ${combinedTotal.toFixed(2)} h`);

      return { allAreaRows, proshopTotal, adminTotal, combinedTotal, rosterCount: rosterData.length };
    },

    render: ({ allAreaRows, proshopTotal, adminTotal, combinedTotal, rosterCount }, values, modal) => {
      const { start: weekStart, end: weekEnd } = values;

      modal.setStatus('Building report…');
      modal.setProgress(88);

      // CSV — two sections separated by a blank line
      const AREA_COLS = [
        { header: 'Area',     value: r => r.name },
        { header: 'Category', value: r => r.category },
        { header: 'Hours',    value: r => r.hrs.toFixed(2) },
      ];
      const TOTALS_COLS = [
        { header: 'Category',    value: r => r.label },
        { header: 'Total Hours', value: r => r.hrs.toFixed(2) },
      ];
      const totalsRows = [
        { label: 'Proshop',  hrs: proshopTotal },
        { label: 'Admin',    hrs: adminTotal },
        { label: 'Combined', hrs: combinedTotal },
      ];
      const csvText = csv.toCSV(allAreaRows, AREA_COLS) + '\n\n' + csv.toCSV(totalsRows, TOTALS_COLS);
      const fname = `deputy_hours_${weekStart}_to_${weekEnd}.csv`;
      log(`CSV ready: "${fname}"`);

      modal.setProgress(100);
      modal.setStatus(`✅ ${rosterCount} shifts — ${combinedTotal.toFixed(2)} h combined (${proshopTotal.toFixed(2)} h Proshop, ${adminTotal.toFixed(2)} h Admin).`, 'success');

      // Summary table — kept inline; grouped rows + totals don't fit table.render cleanly
      const td    = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;';
      const th    = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;color:#262b2f;';
      const teal  = 'color:#eeb02b;font-weight:600;';
      const slate = 'color:#4b5563;font-weight:600;';

      let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${th}text-align:left;">Area</th>
          <th style="${th}text-align:left;">Category</th>
          <th style="${th}text-align:right;">Hours</th>
        </tr></thead><tbody>`;

      allAreaRows.forEach(r => {
        const catStyle = r.category === 'Proshop' ? teal : slate;
        tbl += `<tr>
          <td style="${td}">${escHtml(r.name)}</td>
          <td style="${td}${catStyle}">${r.category}</td>
          <td style="${td}text-align:right;">${r.hrs.toFixed(2)}</td>
        </tr>`;
      });

      const totStyle = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;';
      tbl += `
        <tr><td style="${totStyle}">Proshop Total</td><td style="${totStyle}${teal}">Proshop</td><td style="${totStyle}text-align:right;">${proshopTotal.toFixed(2)}</td></tr>
        <tr><td style="${totStyle}">Admin Total</td><td style="${totStyle}${slate}">Admin</td><td style="${totStyle}text-align:right;">${adminTotal.toFixed(2)}</td></tr>
        <tr><td style="${totStyle}">Combined Total</td><td style="${totStyle}"></td><td style="${totStyle}text-align:right;">${combinedTotal.toFixed(2)}</td></tr>
        </tbody></table>`;

      const heading = `<h3 style="font-family:sans-serif;margin-bottom:8px;">Deputy Scheduled Hours: ${weekStart} – ${weekEnd}</h3>`;

      const dlBtn = download.csvButton({ csv: csvText, filename: fname, label: `⬇  Download ${fname}` });
      const cpBtn = copy.tableButton({ html: heading + tbl });
      cpBtn.style.cssText += 'display:block;width:100%;margin-top:10px;margin-bottom:14px;';

      const result = document.createElement('div');
      result.appendChild(dlBtn);
      result.appendChild(cpBtn);
      result.insertAdjacentHTML('beforeend',
        `<div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Hours Summary</div>${tbl}`
      );
      modal.showResult(result);
    },
  });

})();
