(function PerfectVenueReportUI() {

  const VENUE_ID = '15749';

  const { escHtml, makeLogger, createModal, apiClient, csv, download, copy, table, runReport, dates } = window.SkylinksUtils;
  const log = makeLogger('PV Report');

  const QUERY = `query ConversionRateAnalyticsOverview(
  $venueIds: [ID!]!,
  $startDate: ISO8601DateTime!,
  $endDate: ISO8601DateTime!,
  $comparisonStartDate: ISO8601DateTime,
  $comparisonEndDate: ISO8601DateTime
) {
  conversionRateAnalyticsOverview(
    venueIds: $venueIds
    startDate: $startDate
    endDate: $endDate
    comparisonStartDate: $comparisonStartDate
    comparisonEndDate: $comparisonEndDate
  ) {
    ...ConversionRateAnalyticsFragment
    __typename
  }
}
fragment ConversionRateAnalyticsFragment on ConversionRateAnalytics {
  startDate
  endDate
  comparisonStartDate
  comparisonEndDate
  newLeadsCount            { value comparisonValue changePercent __typename }
  confirmedEventsCount     { value comparisonValue changePercent __typename }
  lostEventsCount          { value comparisonValue changePercent __typename }
  conversionRatePercent    { value comparisonValue changePercent __typename }
  totalSalesAmount         { value comparisonValue changePercent __typename }
  totalPaymentsAmount      { value comparisonValue changePercent __typename }
  averageResponseTimeMinutes { value comparisonValue changePercent __typename }
  __typename
}`;

  const METRICS = [
    { label: 'New Leads',         field: 'newLeadsCount',              fmt: v => v != null ? String(v) : '' },
    { label: 'Confirmed Events',  field: 'confirmedEventsCount',       fmt: v => v != null ? String(v) : '' },
    { label: 'Lost Leads',        field: 'lostEventsCount',            fmt: v => v != null ? String(v) : '' },
    { label: 'Conversion Rate',   field: 'conversionRatePercent',      fmt: v => v != null ? v.toFixed(2) + '%' : '' },
    { label: 'Total Sales',       field: 'totalSalesAmount',           fmt: v => v != null ? '$' + (v / 100).toFixed(2) : '' },
    { label: 'Total Payments',    field: 'totalPaymentsAmount',        fmt: v => v != null ? '$' + (v / 100).toFixed(2) : '' },
    { label: 'Avg Response Time', field: 'averageResponseTimeMinutes', fmt: v => v != null ? v.toFixed(2) + ' min' : '' },
  ];

  const { monday: defaultMonday } = dates.weekRangeMonSun();

  const api = apiClient({
    baseUrl: 'https://api.perfectvenue.com',
    auth: 'cookie',
    defaultHeaders: { Accept: '*/*' },
  });

  const modal = createModal({
    id: 'pv',
    title: 'Weekly Analytics Report',
    emoji: '📈',
    description: 'Fetches new leads, confirmed events, conversion rate, sales, payments, and response time from Perfect Venue for a Monday–Sunday week, compared to the prior week.',
    fields: [
      {
        id: 'monday', type: 'date', label: 'Week Starting (Monday)', value: defaultMonday,
        hint: values => values.monday ? `Week: ${values.monday} → ${dates.addDays(values.monday, 6)}` : '',
      },
    ],
    runLabel: 'Generate Report',
  });

  runReport({
    modal,
    validate: ({ monday }) => monday ? null : 'Please select a Monday date.',

    fetch: async ({ monday: mondayStr }, ctx) => {
      const sundayStr     = dates.addDays(mondayStr, 6);
      const prevMondayStr = dates.addDays(mondayStr, -7);
      const startDate     = dates.pacificMidnightUTC(mondayStr).toISOString();
      const endDate       = dates.pacificMidnightUTC(dates.addDays(mondayStr, 7)).toISOString();
      const compStart     = dates.pacificMidnightUTC(prevMondayStr).toISOString();
      const compEnd       = startDate;

      log(`Starting report for ${mondayStr} → ${sundayStr}`);
      log(`startDate: ${startDate}, endDate: ${endDate}`);
      log(`comparisonStartDate: ${compStart}, comparisonEndDate: ${compEnd}`);

      ctx.setStatus('Fetching analytics…');
      ctx.setProgress(20);

      const data = await api.graphql('/graphql', {
        operationName: 'ConversionRateAnalyticsOverview',
        query: QUERY,
        variables: { venueIds: [VENUE_ID], startDate, endDate, comparisonStartDate: compStart, comparisonEndDate: compEnd },
      });

      const d = data?.conversionRateAnalyticsOverview;
      if (!d) throw new Error('Unexpected response shape — conversionRateAnalyticsOverview missing.');

      ctx.setProgress(70);
      log('Response received:', d);
      return { d, mondayStr, sundayStr, prevMondayStr };
    },

    process: raw => raw,

    render: ({ d, mondayStr, sundayStr, prevMondayStr }, _values, modal) => {
      const prevSundayStr = dates.addDays(mondayStr, -1);

      modal.setStatus('Building CSV…');
      modal.setProgress(85);

      const CSV_COLS = [
        { header: 'Metric', value: r => r.label },
        { header: `This Week (${mondayStr} – ${sundayStr})`,       value: r => r.fmt(d[r.field]?.value) },
        { header: `Prev Week (${prevMondayStr} – ${prevSundayStr})`, value: r => r.fmt(d[r.field]?.comparisonValue) },
        { header: 'Change %', value: r => { const chg = d[r.field]?.changePercent; return chg != null ? chg.toFixed(2) + '%' : ''; } },
      ];
      const TABLE_COLS = [
        { header: 'Metric',    value: r => r.label },
        { header: 'This Week', value: r => r.fmt(d[r.field]?.value), align: 'right' },
        { header: 'Prev Week', value: r => r.fmt(d[r.field]?.comparisonValue), align: 'right', style: () => 'color:#94a3b8;' },
        {
          header: 'Change', align: 'right',
          value: r => { const chg = d[r.field]?.changePercent; return chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : ''; },
          style: r => { const chg = d[r.field]?.changePercent; return chg == null ? '' : chg >= 0 ? 'color:#16a34a;' : 'color:#dc2626;'; },
        },
      ];

      const csvText = csv.toCSV(METRICS, CSV_COLS);
      const fname = `perfectvenue_weekly_${mondayStr}_to_${sundayStr}.csv`;
      log(`CSV ready: "${fname}"`);

      const tableEl = table.render(METRICS, TABLE_COLS);
      const heading = `<h3 style="font-family:sans-serif;margin-bottom:8px;">Perfect Venue Analytics: ${mondayStr} – ${sundayStr}</h3>`;

      modal.setProgress(100);
      modal.setStatus(`✅ Report generated for ${mondayStr} → ${sundayStr}.`, 'success');

      const dlBtn = download.csvButton({ csv: csvText, filename: fname, label: `⬇  Download ${fname}` });
      const cpBtn = copy.tableButton({ html: heading + tableEl.outerHTML, label: '📋  Copy Table to Clipboard' });

      const result = document.createElement('div');
      result.appendChild(dlBtn);
      cpBtn.style.cssText += 'display:block;width:100%;margin-top:10px;margin-bottom:14px;';
      result.appendChild(cpBtn);
      result.insertAdjacentHTML('beforeend', '<div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Analytics Summary</div>');
      result.appendChild(tableEl);
      modal.showResult(result);
    },
  });

})();
