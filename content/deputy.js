(function DeputyReportUI() {

    const BASE = 'https://348a3926020407.na.deputy.com';

    const PROSHOP_OU_IDS = new Set([1, 7, 8, 13, 17, 18, 19]);
    const ADMIN_OU_IDS   = new Set([6]);

    const OU_FALLBACK_NAMES = {
        1: 'Proshop', 7: 'Pro Shop', 8: 'Training', 13: 'Event Host',
        17: 'Bev Cart', 18: 'Outside Services', 19: 'Kids Zone / Patio / Carts',
        6: 'Admin', 4: 'Course Crew',
    };

    // Compute current week Mon–Sun defaults
    const today = new Date();
    const daysToMon = (today.getDay() + 6) % 7;
    const mon = new Date(today); mon.setDate(today.getDate() - daysToMon);
    const sun = new Date(mon);   sun.setDate(mon.getDate() + 6);
    const fmt = d => d.toISOString().slice(0, 10);
    const defaultStart = fmt(mon);
    const defaultEnd   = fmt(sun);

    document.getElementById('dep-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'dep-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">🕐</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',Tahoma,sans-serif;color:#262b2f;">Weekly Hours Report</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#4b5563;line-height:1.5;">
      Fetches all scheduled shifts from Deputy for a Monday–Sunday week and totals hours
      by area, grouped into Proshop and Admin categories.
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div>
        <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Week Start (Monday)</label>
        <input id="dep-start" type="date" value="${defaultStart}"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
      <div>
        <label style="display:block;font-size:13px;font-weight:600;color:#262b2f;margin-bottom:6px;">Week End (Sunday)</label>
        <input id="dep-end" type="date" value="${defaultEnd}"
          style="width:100%;padding:10px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;box-sizing:border-box;outline:none;" />
      </div>
    </div>
    <button id="dep-run"
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;">
      Generate Report
    </button>
    <div id="dep-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="dep-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="dep-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
      </div>
    </div>
    <div id="dep-result" style="margin-top:12px;"></div>
    <button id="dep-close"
      style="margin-top:14px;width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;padding:9px;border-radius:8px;font-size:13px;color:#64748b;cursor:pointer;">
      Close
    </button>
  `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const $ = id => document.getElementById(id);
    const css = (id, prop, val) => $(id).style[prop] = val;
    const setStatus = (msg, color) => { css('dep-status', 'color', color || '#475569'); $('dep-status').textContent = msg; };
    const setProgress = pct => css('dep-bar', 'width', pct + '%');
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escCsv = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const log = (msg, ...args) => console.log(`[Deputy Report] ${msg}`, ...args);

    let activeBlobURL = null;
    const revokeBlobURL = () => { if (activeBlobURL) { URL.revokeObjectURL(activeBlobURL); activeBlobURL = null; } };

    $('dep-close').onclick = () => { revokeBlobURL(); overlay.remove(); };
    overlay.onclick = e => { if (e.target === overlay) { revokeBlobURL(); overlay.remove(); } };

    $('dep-run').onclick = async function () {
        const weekStart = $('dep-start').value;
        const weekEnd   = $('dep-end').value;
        if (!weekStart || !weekEnd) { setStatus('Please select both a start and end date.', '#dc2626'); return; }
        if (weekStart > weekEnd)    { setStatus('Week start must be on or before week end.', '#dc2626'); return; }

        this.disabled = true;
        revokeBlobURL();
        $('dep-result').innerHTML = '';
        css('dep-progress', 'display', 'block');
        setProgress(0);
        log(`Starting report for ${weekStart} → ${weekEnd}`);

        try {
            setStatus('Fetching areas and shifts…');

            const [ouData, rosterData] = await Promise.all([
                fetch(`${BASE}/api/v1/resource/OperationalUnit?max=100`, {
                    headers: { 'Accept': 'application/json' },
                }).then(r => { if (!r.ok) throw new Error(`OU API ${r.status}`); return r.json(); }),

                fetch(`${BASE}/api/v1/resource/Roster/QUERY`, {
                    method: 'POST',
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        search: {
                            s1: { field: 'Date', type: 'ge', data: weekStart },
                            s2: { field: 'Date', type: 'le', data: weekEnd },
                        },
                        sort: { Date: 'asc' },
                        start: 0,
                        max: 500,
                    }),
                }).then(r => { if (!r.ok) throw new Error(`Roster API ${r.status}`); return r.json(); }),
            ]);

            setProgress(60);

            // Build OU name map from API, fall back to hardcoded names
            const ouNameMap = { ...OU_FALLBACK_NAMES };
            if (Array.isArray(ouData)) {
                ouData.forEach(ou => { ouNameMap[ou.Id] = ou.OperationalUnitName; });
            }
            log(`Loaded ${Array.isArray(ouData) ? ouData.length : 0} operational units. ${rosterData.length} shifts returned.`);

            setStatus('Processing shifts…');
            setProgress(75);

            // Sum hours by OU, grouped by category
            const proshopByArea = {};
            const adminByArea   = {};
            let proshopTotal = 0;
            let adminTotal   = 0;

            for (const shift of rosterData) {
                const ou  = shift.OperationalUnit;
                const hrs = shift.TotalTime || 0;
                if (PROSHOP_OU_IDS.has(ou)) {
                    proshopByArea[ou] = (proshopByArea[ou] || 0) + hrs;
                    proshopTotal += hrs;
                } else if (ADMIN_OU_IDS.has(ou)) {
                    adminByArea[ou] = (adminByArea[ou] || 0) + hrs;
                    adminTotal += hrs;
                }
            }

            const combinedTotal = proshopTotal + adminTotal;
            log(`Proshop: ${proshopTotal.toFixed(2)} h, Admin: ${adminTotal.toFixed(2)} h, Combined: ${combinedTotal.toFixed(2)} h`);

            setStatus('Building report…');
            setProgress(88);

            // Build area rows sorted by hours descending within each category
            const proshopRows = Object.entries(proshopByArea)
                .map(([id, hrs]) => ({ id: parseInt(id), name: ouNameMap[id] || `Area ${id}`, category: 'Proshop', hrs }))
                .sort((a, b) => b.hrs - a.hrs);
            const adminRows = Object.entries(adminByArea)
                .map(([id, hrs]) => ({ id: parseInt(id), name: ouNameMap[id] || `Area ${id}`, category: 'Admin', hrs }))
                .sort((a, b) => b.hrs - a.hrs);
            const allAreaRows = [...proshopRows, ...adminRows];

            // CSV
            const csvLines = [
                'Area,Category,Hours',
                ...allAreaRows.map(r => [r.name, r.category, r.hrs.toFixed(2)].map(escCsv).join(',')),
                '',
                'Category,Total Hours',
                ['Proshop', proshopTotal.toFixed(2)].map(escCsv).join(','),
                ['Admin', adminTotal.toFixed(2)].map(escCsv).join(','),
                ['Combined', combinedTotal.toFixed(2)].map(escCsv).join(','),
            ];
            const csv = csvLines.join('\n');

            activeBlobURL = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
            const fname = `deputy_hours_${weekStart}_to_${weekEnd}.csv`;
            log(`CSV ready: "${fname}"`);

            setProgress(100);
            setStatus(`✅ ${rosterData.length} shifts — ${combinedTotal.toFixed(2)} h combined (${proshopTotal.toFixed(2)} h Proshop, ${adminTotal.toFixed(2)} h Admin).`, '#16a34a');

            // Summary table
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

            $('dep-result').innerHTML = `
        <a href="${activeBlobURL}" download="${fname}"
          style="display:block;text-align:center;background:#eeb02b;color:#1c1b19;padding:13px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:10px;">
          ⬇&nbsp; Download ${fname}
        </a>
        <button id="dep-copy"
          style="width:100%;background:transparent;border:1.5px solid #262b2f;padding:11px;border-radius:10px;font-size:14px;font-weight:600;color:#262b2f;cursor:pointer;margin-bottom:14px;">
          📋&nbsp; Copy Table to Clipboard
        </button>
        <div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Hours Summary</div>
        ${tbl}`;

            $('dep-result').querySelector('a').onclick = () => setTimeout(revokeBlobURL, 10000);

            $('dep-copy').onclick = async function () {
                try {
                    await navigator.clipboard.write([
                        new ClipboardItem({ 'text/html': new Blob([heading + tbl], { type: 'text/html' }) }),
                    ]);
                    this.innerHTML = '✅&nbsp; Copied!';
                    setTimeout(() => { this.innerHTML = '📋&nbsp; Copy Table to Clipboard'; }, 2000);
                } catch (e) {
                    this.innerHTML = '❌&nbsp; Copy failed';
                    console.error('[Deputy Report] Clipboard error:', e);
                }
            };

        } catch (err) {
            setStatus('❌ Error: ' + err.message, '#dc2626');
            css('dep-progress', 'display', 'none');
            console.error('[Deputy Report] Error:', err);
        }
        this.disabled = false;
    };

})();
