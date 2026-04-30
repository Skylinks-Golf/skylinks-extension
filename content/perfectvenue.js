(function PerfectVenueReportUI() {

    const VENUE_ID = '15749';
    const GRAPHQL_URL = 'https://api.perfectvenue.com/graphql';
    const TZ = 'America/Los_Angeles';

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

    // Convert 'YYYY-MM-DD' midnight in America/Los_Angeles to UTC ISO string.
    // Tries both PDT (UTC-7) and PST (UTC-8) offsets and picks the one that
    // still lands on the correct calendar date in Pacific time.
    function midnightPTtoUTC(dateStr) {
        for (const hour of ['07', '08']) {
            const candidate = new Date(`${dateStr}T${hour}:00:00.000Z`);
            const local = candidate.toLocaleDateString('en-CA', { timeZone: TZ });
            if (local === dateStr) return candidate.toISOString();
        }
        return new Date(`${dateStr}T07:00:00.000Z`).toISOString();
    }

    function addDays(dateStr, n) {
        const d = new Date(dateStr + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + n);
        return d.toISOString().slice(0, 10);
    }

    // Compute Monday of current week as 'YYYY-MM-DD'
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysToMon = (dayOfWeek + 6) % 7;
    const mon = new Date(today);
    mon.setDate(today.getDate() - daysToMon);
    const defaultMonday = mon.toISOString().slice(0, 10);
    const defaultSunday = addDays(defaultMonday, 6);

    document.getElementById('pv-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pv-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">📈</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',Tahoma,sans-serif;color:#262b2f;">Weekly Analytics Report</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#4b5563;line-height:1.5;">
      Fetches new leads, confirmed events, conversion rate, sales, payments, and response time
      from Perfect Venue for a Monday–Sunday week, compared to the prior week.
    </p>
    <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Week Starting (Monday)</label>
    <input id="pv-monday" type="date" value="${defaultMonday}"
      style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:15px;box-sizing:border-box;margin-bottom:8px;outline:none;" />
    <p id="pv-week-label" style="font-size:12px;color:#94a3b8;margin:0 0 16px 0;">Week: ${defaultMonday} → ${defaultSunday}</p>
    <button id="pv-run"
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      Generate Report
    </button>
    <div id="pv-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="pv-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="pv-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
      </div>
    </div>
    <div id="pv-result" style="margin-top:12px;"></div>
    <button id="pv-close"
      style="margin-top:14px;width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;padding:9px;border-radius:8px;font-size:13px;color:#64748b;cursor:pointer;">
      Close
    </button>
  `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const $ = id => document.getElementById(id);
    const css = (id, prop, val) => $(id).style[prop] = val;
    const setStatus = (msg, color) => { css('pv-status', 'color', color || '#475569'); $('pv-status').textContent = msg; };
    const setProgress = pct => css('pv-bar', 'width', pct + '%');
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const log = (msg, ...args) => console.log(`[PV Report] ${msg}`, ...args);

    let activeBlobURL = null;
    const revokeBlobURL = () => { if (activeBlobURL) { URL.revokeObjectURL(activeBlobURL); activeBlobURL = null; } };

    $('pv-close').onclick = () => { revokeBlobURL(); overlay.remove(); };
    overlay.onclick = e => { if (e.target === overlay) { revokeBlobURL(); overlay.remove(); } };

    // Update the week label when Monday date changes
    $('pv-monday').oninput = function () {
        const sunday = this.value ? addDays(this.value, 6) : '';
        $('pv-week-label').textContent = this.value ? `Week: ${this.value} → ${sunday}` : '';
    };

    const escCsv = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };

    $('pv-run').onclick = async function () {
        const mondayStr = $('pv-monday').value;
        if (!mondayStr) { setStatus('Please select a Monday date.', '#dc2626'); return; }

        this.disabled = true;
        revokeBlobURL();
        $('pv-result').innerHTML = '';
        css('pv-progress', 'display', 'block');
        setProgress(0);

        const sundayStr = addDays(mondayStr, 6);
        log(`Starting report for ${mondayStr} → ${sundayStr}`);

        try {
            const startDate      = midnightPTtoUTC(mondayStr);
            const endDate        = midnightPTtoUTC(addDays(mondayStr, 7));
            const compStart      = midnightPTtoUTC(addDays(mondayStr, -7));
            const compEnd        = startDate;
            const prevMondayStr  = addDays(mondayStr, -7);
            const prevSundayStr  = addDays(mondayStr, -1);

            log(`startDate: ${startDate}, endDate: ${endDate}`);
            log(`comparisonStartDate: ${compStart}, comparisonEndDate: ${compEnd}`);

            setStatus('Fetching analytics…');
            setProgress(20);

            const response = await fetch(GRAPHQL_URL, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
                body: JSON.stringify({
                    operationName: 'ConversionRateAnalyticsOverview',
                    variables: {
                        venueIds: [VENUE_ID],
                        startDate,
                        endDate,
                        comparisonStartDate: compStart,
                        comparisonEndDate: compEnd,
                    },
                    query: QUERY,
                }),
            });

            if (!response.ok) throw new Error(`API ${response.status} ${response.statusText}`);
            const json = await response.json();
            if (json.errors?.length) throw new Error(json.errors.map(e => e.message).join('; '));

            setProgress(70);

            const d = json.data?.conversionRateAnalyticsOverview;
            if (!d) throw new Error('Unexpected response shape — conversionRateAnalyticsOverview missing.');

            log('Response received:', d);

            const fmtMoney = cents => '$' + (cents / 100).toFixed(2);
            const fmtPct   = v => (v != null ? v.toFixed(2) + '%' : '');
            const fmtNum   = v => (v != null ? String(v) : '');
            const fmtMin   = v => (v != null ? v.toFixed(2) + ' min' : '');

            const metrics = [
                { label: 'New Leads',              field: 'newLeadsCount',              fmt: fmtNum   },
                { label: 'Confirmed Events',        field: 'confirmedEventsCount',       fmt: fmtNum   },
                { label: 'Lost Leads',              field: 'lostEventsCount',            fmt: fmtNum   },
                { label: 'Conversion Rate',         field: 'conversionRatePercent',      fmt: fmtPct   },
                { label: 'Total Sales',             field: 'totalSalesAmount',           fmt: fmtMoney },
                { label: 'Total Payments',          field: 'totalPaymentsAmount',        fmt: fmtMoney },
                { label: 'Avg Response Time',       field: 'averageResponseTimeMinutes', fmt: fmtMin   },
            ];

            setStatus('Building CSV…');
            setProgress(85);

            const csvHeader = ['Metric', `This Week (${mondayStr} – ${sundayStr})`, `Prev Week (${prevMondayStr} – ${prevSundayStr})`, 'Change %'].map(escCsv).join(',');
            const csvRows = metrics.map(m => {
                const datum = d[m.field];
                return [
                    m.label,
                    m.fmt(datum?.value),
                    m.fmt(datum?.comparisonValue),
                    datum?.changePercent != null ? datum.changePercent.toFixed(2) + '%' : '',
                ].map(escCsv).join(',');
            });
            const csv = [csvHeader, ...csvRows].join('\n');

            activeBlobURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            const fname = `perfectvenue_weekly_${mondayStr}_to_${sundayStr}.csv`;
            log(`CSV ready: "${fname}"`);

            setProgress(100);
            setStatus(`✅ Report generated for ${mondayStr} → ${sundayStr}.`, '#16a34a');

            // Summary table
            const td  = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;';
            const th  = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;color:#262b2f;';
            const pctColor = v => v == null ? '' : v >= 0 ? 'color:#16a34a;' : 'color:#dc2626;';
            let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${th}text-align:left;">Metric</th>
          <th style="${th}text-align:right;">This Week</th>
          <th style="${th}text-align:right;">Prev Week</th>
          <th style="${th}text-align:right;">Change</th>
        </tr></thead><tbody>`;
            metrics.forEach(m => {
                const datum = d[m.field];
                const chg = datum?.changePercent;
                tbl += `<tr>
          <td style="${td}">${escHtml(m.label)}</td>
          <td style="${td}text-align:right;">${escHtml(m.fmt(datum?.value))}</td>
          <td style="${td}text-align:right;color:#94a3b8;">${escHtml(m.fmt(datum?.comparisonValue))}</td>
          <td style="${td}text-align:right;${pctColor(chg)}">${chg != null ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : ''}</td>
        </tr>`;
            });
            tbl += '</tbody></table>';

            $('pv-result').innerHTML = `
        <a href="${activeBlobURL}" download="${fname}"
          style="display:block;text-align:center;background:#eeb02b;color:#1c1b19;padding:13px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:10px;">
          ⬇&nbsp; Download ${fname}
        </a>
        <button id="pv-copy"
          style="width:100%;background:transparent;border:1.5px solid #262b2f;padding:11px;border-radius:10px;font-size:14px;font-weight:600;color:#262b2f;cursor:pointer;margin-bottom:14px;">
          📋&nbsp; Copy Table to Clipboard
        </button>
        <div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Analytics Summary</div>
        ${tbl}`;
            $('pv-result').querySelector('a').onclick = () => setTimeout(revokeBlobURL, 10000);

            $('pv-copy').onclick = async function () {
                const heading = `<h3 style="font-family:sans-serif;margin-bottom:8px;">Perfect Venue Analytics: ${mondayStr} – ${sundayStr}</h3>`;
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'text/html': new Blob([heading + tbl], { type: 'text/html' }) }),
                    ]);
                    this.innerHTML = '✅&nbsp; Copied!';
                    setTimeout(() => { this.innerHTML = '📋&nbsp; Copy Table to Clipboard'; }, 2000);
                } catch (e) {
                    this.innerHTML = '❌&nbsp; Copy failed';
                    console.error('[PV Report] Clipboard error:', e);
                }
            };

        } catch (err) {
            setStatus('❌ Error: ' + err.message, '#dc2626');
            css('pv-progress', 'display', 'none');
            console.error('[PV Report] Error:', err);
        }
        this.disabled = false;
    };

})();
