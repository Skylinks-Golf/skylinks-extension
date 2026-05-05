(function SelectPiReportUI() {

  const token = localStorage.getItem('token');
  if (!token) {
    alert('Skylinks Tools: No auth token found in localStorage. Make sure you are logged into the SelectPi Portal.');
    return;
  }

  const { escHtml, makeLogger, createModal, apiClient, csv, download, runReport, dates } = window.SkylinksUtils;
  const log = makeLogger('SP Report');

  const { monday: defaultStart, sunday: defaultEnd } = dates.weekRangeMonSun();

  const api = apiClient({
    auth: { bearerFromLocalStorage: 'token' },
  });

  const modal = createModal({
    id: 'sp',
    title: 'Weekly Earnings Report',
    emoji: '⛳',
    description: 'Fetches earnings at dispensers, cashiers, totals by bucket size, and balls dispensed by weekday from the SelectPi API, then downloads a single CSV with all four sections.',
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
      ctx.setStatus('Fetching report data…');
      log(`Starting report for ${weekStart} → ${weekEnd}`);
      log('Fetching all 4 endpoints in parallel…');

      const [dispensers, cashier, bucketSizes, ballsByDay] = await Promise.all([
        api.post('/api/Report/EarningsAtDispenser',     { start: weekStart, end: weekEnd }),
        api.post('/api/Report/EarningsAtCashier',       { start: weekStart, end: weekEnd }),
        api.post('/api/Report/TotalsByBucketSize',      { start: weekStart, end: weekEnd }),
        api.post('/api/Report/BallsDispensedByWeekDay', { start: weekStart, end: weekEnd, getMinutes: false }),
      ]);
      ctx.setProgress(70);

      log(`Dispensers: ${dispensers.models?.length ?? 0} rows`);
      log(`Cashier: ${cashier.models?.length ?? 0} rows`);
      log(`Bucket sizes: ${bucketSizes.models?.length ?? 0} rows`);
      log(`Balls by day: ${ballsByDay.models?.length ?? 0} rows`);

      return { dispensers, cashier, bucketSizes, ballsByDay };
    },

    process: ({ dispensers, cashier, bucketSizes, ballsByDay }) => {
      const sections = [
        { label: 'Earnings At Dispenser',       models: dispensers.models },
        { label: 'Earnings At Cashier',         models: cashier.models },
        { label: 'Totals By Bucket Size',       models: bucketSizes.models },
        { label: 'Balls Dispensed By Week Day', models: ballsByDay.models },
      ];
      const csvText = csv.joinSections(sections.map(s => csv.toAutoSection(s.label, s.models)));
      return { csvText, sections };
    },

    render: ({ csvText, sections }, values, modal) => {
      const { start: weekStart, end: weekEnd } = values;
      const fname = `selectpi_weekly_${weekStart}_to_${weekEnd}.csv`;
      log(`CSV ready: "${fname}"`);
      modal.setProgress(100);

      const totalRows = sections.reduce((s, sec) => s + (sec.models?.length ?? 0), 0);
      modal.setStatus(`✅ ${totalRows} total rows across 4 report sections.`, 'success');

      const td = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;';
      const th = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;color:#262b2f;';
      let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${th}text-align:left;">Section</th>
          <th style="${th}text-align:center;">Rows</th>
        </tr></thead><tbody>`;
      sections.forEach(sec => {
        tbl += `<tr><td style="${td}">${escHtml(sec.label)}</td><td style="${td}text-align:center;">${sec.models?.length ?? 0}</td></tr>`;
      });
      tbl += `<tr style="font-weight:700;background:#f8fafc;"><td style="${td}">TOTAL</td><td style="${td}text-align:center;">${totalRows}</td></tr></tbody></table>`;

      const dlBtn = download.csvButton({ csv: csvText, filename: fname, label: `⬇  Download ${fname}` });
      const result = document.createElement('div');
      result.appendChild(dlBtn);
      result.insertAdjacentHTML('beforeend',
        `<div style="font-size:12px;font-weight:700;color:#262b2f;margin-top:14px;margin-bottom:4px;">Report Summary</div>${tbl}`
      );
      modal.showResult(result);
    },
  });

})();
