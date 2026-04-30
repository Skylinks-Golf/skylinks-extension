(function SelectPiReportUI() {

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Skylinks Tools: No auth token found in localStorage. Make sure you are logged into the SelectPi Portal.');
        return;
    }

    document.getElementById('sp-overlay')?.remove();

    // Compute current week Mon–Sun defaults
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun … 6=Sat
    const daysToMon = (dayOfWeek + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - daysToMon);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);
    const defaultStart = fmt(mon);
    const defaultEnd   = fmt(sun);

    const overlay = document.createElement('div');
    overlay.id = 'sp-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">⛳</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',Tahoma,sans-serif;color:#262b2f;">Weekly Earnings Report</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#4b5563;line-height:1.5;">
      Fetches earnings at dispensers, cashiers, totals by bucket size, and balls dispensed by weekday
      from the SelectPi API, then downloads a single CSV with all four sections.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Week Start (Monday)</label>
        <input id="sp-start" type="date" value="${defaultStart}"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
      <div>
        <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Week End (Sunday)</label>
        <input id="sp-end" type="date" value="${defaultEnd}"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
    </div>
    <button id="sp-run"
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      Generate Report
    </button>
    <div id="sp-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="sp-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="sp-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
      </div>
    </div>
    <div id="sp-result" style="margin-top:12px;"></div>
    <button id="sp-close"
      style="margin-top:14px;width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;padding:9px;border-radius:8px;font-size:13px;color:#64748b;cursor:pointer;">
      Close
    </button>
  `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const $ = id => document.getElementById(id);
    const css = (id, prop, val) => $(id).style[prop] = val;
    const setStatus = (msg, color) => { css('sp-status', 'color', color || '#475569'); $('sp-status').textContent = msg; };
    const setProgress = pct => css('sp-bar', 'width', pct + '%');
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const log = (msg, ...args) => console.log(`[SP Report] ${msg}`, ...args);

    let activeBlobURL = null;
    const revokeBlobURL = () => { if (activeBlobURL) { URL.revokeObjectURL(activeBlobURL); activeBlobURL = null; } };

    $('sp-close').onclick = () => { revokeBlobURL(); overlay.remove(); };
    overlay.onclick = e => { if (e.target === overlay) { revokeBlobURL(); overlay.remove(); } };

    // CSV helpers
    const escCsv = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };

    function sectionToCSV(title, models) {
        if (!Array.isArray(models) || models.length === 0) {
            return [title, '(no data)', ''].join('\n');
        }
        const cols = Object.keys(models[0]);
        const header = cols.map(escCsv).join(',');
        const dataRows = models.map(row => cols.map(c => escCsv(row[c])).join(','));
        return [title, header, ...dataRows, ''].join('\n');
    }

    $('sp-run').onclick = async function () {
        const weekStart = $('sp-start').value;
        const weekEnd   = $('sp-end').value;
        if (!weekStart || !weekEnd) { setStatus('Please select both a start and end date.', '#dc2626'); return; }
        if (weekStart > weekEnd)    { setStatus('Week start must be on or before week end.', '#dc2626'); return; }

        this.disabled = true;
        revokeBlobURL();
        $('sp-result').innerHTML = '';
        css('sp-progress', 'display', 'block');
        setProgress(0);
        log(`Starting report for ${weekStart} → ${weekEnd}`);

        try {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            };
            const post = (path, body) => fetch(path, { method: 'POST', headers, body: JSON.stringify(body) })
                .then(r => { if (!r.ok) throw new Error(`API ${r.status} ${r.statusText} (${path})`); return r.json(); });

            setStatus('Fetching report data…');
            log('Fetching all 4 endpoints in parallel…');

            const [dispensers, cashier, bucketSizes, ballsByDay] = await Promise.all([
                post('/api/Report/EarningsAtDispenser',     { start: weekStart, end: weekEnd }),
                post('/api/Report/EarningsAtCashier',       { start: weekStart, end: weekEnd }),
                post('/api/Report/TotalsByBucketSize',      { start: weekStart, end: weekEnd }),
                post('/api/Report/BallsDispensedByWeekDay', { start: weekStart, end: weekEnd, getMinutes: false }),
            ]);
            setProgress(70);

            log(`Dispensers: ${dispensers.models?.length ?? 0} rows`);
            log(`Cashier: ${cashier.models?.length ?? 0} rows`);
            log(`Bucket sizes: ${bucketSizes.models?.length ?? 0} rows`);
            log(`Balls by day: ${ballsByDay.models?.length ?? 0} rows`);

            setStatus('Building CSV…');

            const csv = [
                sectionToCSV('Earnings At Dispenser',          dispensers.models),
                sectionToCSV('Earnings At Cashier',            cashier.models),
                sectionToCSV('Totals By Bucket Size',          bucketSizes.models),
                sectionToCSV('Balls Dispensed By Week Day',    ballsByDay.models),
            ].join('\n');

            setProgress(90);

            activeBlobURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            const fname = `selectpi_weekly_${weekStart}_to_${weekEnd}.csv`;
            log(`CSV ready: "${fname}"`);

            setProgress(100);

            const sections = [
                { label: 'Earnings At Dispenser',       rows: dispensers.models  },
                { label: 'Earnings At Cashier',         rows: cashier.models     },
                { label: 'Totals By Bucket Size',       rows: bucketSizes.models },
                { label: 'Balls Dispensed By Week Day', rows: ballsByDay.models  },
            ];
            const totalRows = sections.reduce((s, sec) => s + (sec.rows?.length ?? 0), 0);
            setStatus(`✅ ${totalRows} total rows across 4 report sections.`, '#16a34a');

            const td = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;';
            const th = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;color:#262b2f;';
            let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
        <thead><tr>
          <th style="${th}text-align:left;">Section</th>
          <th style="${th}text-align:center;">Rows</th>
        </tr></thead><tbody>`;
            sections.forEach(sec => {
                tbl += `<tr><td style="${td}">${escHtml(sec.label)}</td><td style="${td}text-align:center;">${sec.rows?.length ?? 0}</td></tr>`;
            });
            tbl += `<tr style="font-weight:700;background:#f8fafc;"><td style="${td}">TOTAL</td><td style="${td}text-align:center;">${totalRows}</td></tr></tbody></table>`;

            $('sp-result').innerHTML = `
        <a href="${activeBlobURL}" download="${fname}"
          style="display:block;text-align:center;background:#eeb02b;color:#1c1b19;padding:13px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:14px;">
          ⬇&nbsp; Download ${fname}
        </a>
        <div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Report Summary</div>
        ${tbl}`;
            $('sp-result').querySelector('a').onclick = () => setTimeout(revokeBlobURL, 10000);

        } catch (err) {
            setStatus('❌ Error: ' + err.message, '#dc2626');
            css('sp-progress', 'display', 'none');
            console.error('[SP Report] Error:', err);
        }
        this.disabled = false;
    };

})();
