(function ChronogolfImportUI() {

    const CLUB_ID = window.location.hash.match(/\/clubs\/(\d+)/)?.[1];
    const DELAY_MS = 300;

    if (!CLUB_ID) {
        alert('Skylinks Tools: Could not detect Club ID from this page URL. Navigate to a Lightspeed Golf club page first.');
        return;
    }

    document.getElementById('cg-import-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cg-import-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">👥</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">Customer Import</h2>
    </div>
    <p style="margin:0 0 22px 0;font-size:13px;color:#64748b;line-height:1.5;">
      Upload a CSV file to batch-create customers in Lightspeed Golf.
      Required columns: <strong>first_name, last_name, email, affiliation_type_id</strong>.
    </p>
    <label id="cg-drop-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed #d1d5db;border-radius:10px;padding:28px 16px;cursor:pointer;background:#f8fafc;margin-bottom:16px;transition:border-color .2s;">
      <span style="font-size:28px;">📂</span>
      <span style="font-size:13px;font-weight:600;color:#374151;">Choose CSV file or drag &amp; drop</span>
      <span id="cg-filename" style="font-size:12px;color:#94a3b8;">No file selected</span>
      <input id="cg-file" type="file" accept=".csv,text/csv" style="display:none;" />
    </label>
    <button id="cg-run" disabled
      style="width:100%;background:#16a34a;color:#fff;border:none;padding:13px;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;opacity:0.4;">
      Start Import
    </button>
    <div id="cg-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="cg-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="cg-bar" style="background:#16a34a;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
      </div>
    </div>
    <div id="cg-result" style="margin-top:12px;"></div>
    <button id="cg-close"
      style="margin-top:14px;width:100%;background:#f8fafc;border:1.5px solid #e2e8f0;padding:9px;border-radius:8px;font-size:13px;color:#64748b;cursor:pointer;">
      Close
    </button>
  `;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const $ = id => document.getElementById(id);
    const css = (id, prop, val) => $(id).style[prop] = val;
    const setStatus = (msg, color) => { css('cg-status', 'color', color || '#475569'); $('cg-status').textContent = msg; };
    const setProgress = pct => css('cg-bar', 'width', pct + '%');
    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const log = (msg, ...args) => console.log(`[CG Import] ${msg}`, ...args);

    $('cg-close').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    // File pick via click or drag-and-drop
    let csvText = null;

    function handleFile(file) {
        if (!file) return;
        file.text().then(text => {
            csvText = text;
            $('cg-filename').textContent = file.name;
            $('cg-drop-zone').style.borderColor = '#16a34a';
            $('cg-run').disabled = false;
            $('cg-run').style.opacity = '1';
            setStatus(`Ready — ${file.name}`);
        });
    }

    $('cg-drop-zone').onclick = () => $('cg-file').click();
    $('cg-file').onchange = e => handleFile(e.target.files[0]);

    $('cg-drop-zone').ondragover = e => { e.preventDefault(); $('cg-drop-zone').style.borderColor = '#16a34a'; };
    $('cg-drop-zone').ondragleave = () => { if (!csvText) $('cg-drop-zone').style.borderColor = '#d1d5db'; };
    $('cg-drop-zone').ondrop = e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

    // CSV parser (handles quoted fields)
    function parseCSV(text) {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row.');
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        return lines.slice(1).map((line, i) => {
            const values = [];
            let current = '', inQuotes = false;
            for (const c of line) {
                if (c === '"') { inQuotes = !inQuotes; }
                else if (c === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
                else { current += c; }
            }
            values.push(current.trim());
            const row = {};
            headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
            row._lineNumber = i + 2;
            return row;
        });
    }

    function validateRow(row) {
        const errors = [];
        if (!row.first_name) errors.push('first_name required');
        if (!row.last_name) errors.push('last_name required');
        if (!row.email) errors.push('email required');
        if (!row.affiliation_type_id || isNaN(parseInt(row.affiliation_type_id, 10))) errors.push('affiliation_type_id must be a number');
        return errors;
    }

    function buildPayload(row) {
        const payload = {
            club_id: parseInt(CLUB_ID, 10),
            first_name: row.first_name,
            last_name: row.last_name,
            email: row.email,
            affiliation_type_id: parseInt(row.affiliation_type_id, 10),
        };
        if (row.phone) payload.phone = row.phone;
        if (row.gender) payload.gender = parseInt(row.gender, 10);
        if (row.date_of_birth) payload.date_of_birth = row.date_of_birth;
        if (row.member_no) payload.member_no = row.member_no;
        if (row.bag_number) payload.bag_number = row.bag_number;
        if (row.address_one) payload.address_one = row.address_one;
        if (row.address_two) payload.address_two = row.address_two;
        if (row.city) payload.city = row.city;
        if (row.country_code) payload.country_code = row.country_code.toUpperCase();
        if (row.state_code) payload.state_code = row.state_code;
        if (row.post_code) payload.post_code = row.post_code;
        return payload;
    }

    function getCsrfToken() {
        return document.querySelector('meta[name="csrf-token"]')?.content
            || decodeURIComponent(document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '');
    }

    async function createCustomer(payload) {
        const csrfToken = getCsrfToken();
        const headers = { 'Content-Type': 'application/json' };
        if (csrfToken) { headers['X-CSRF-Token'] = csrfToken; headers['X-XSRF-TOKEN'] = csrfToken; }
        try {
            const r = await fetch(`https://www.chronogolf.ca/private_api/clubs/${CLUB_ID}/customers`, {
                method: 'POST',
                credentials: 'include',
                headers,
                body: JSON.stringify(payload),
            });
            const data = await r.json();
            if (!r.ok) {
                const msg = data.errors ? data.errors.map(e => e.message).join('; ') : (data.error?.message || `HTTP ${r.status}`);
                return { success: false, status: r.status, message: msg };
            }
            return { success: true, id: data.id, ref: data.ref };
        } catch (e) {
            return { success: false, status: 0, message: e.message };
        }
    }

    function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    $('cg-run').onclick = async function () {
        if (!csvText) return;

        let rows;
        try {
            rows = parseCSV(csvText);
        } catch (e) {
            setStatus('CSV error: ' + e.message, '#dc2626');
            return;
        }

        this.disabled = true;
        $('cg-result').innerHTML = '';
        css('cg-progress', 'display', 'block');
        setProgress(0);
        log(`Starting import of ${rows.length} rows for club ${CLUB_ID}`);

        const results = { created: [], skipped: [], failed: [] };

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const name = `${row.first_name} ${row.last_name}`;
            setStatus(`Processing row ${i + 1} of ${rows.length} — ${name}…`);
            setProgress(Math.round((i / rows.length) * 90));

            const errors = validateRow(row);
            if (errors.length > 0) {
                log(`SKIPPED row ${row._lineNumber} (${name}): ${errors.join(', ')}`);
                results.skipped.push({ row: row._lineNumber, name, reason: errors.join(', ') });
                continue;
            }

            const result = await createCustomer(buildPayload(row));
            if (result.success) {
                log(`CREATED row ${row._lineNumber} (${name}) → ID: ${result.id}`);
                results.created.push({ row: row._lineNumber, name, id: result.id, ref: result.ref });
            } else {
                log(`FAILED row ${row._lineNumber} (${name}) → ${result.status}: ${result.message}`);
                results.failed.push({ row: row._lineNumber, name, error: result.message });
            }

            await sleep(DELAY_MS);
        }

        setProgress(100);
        log(`Import complete. Created: ${results.created.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);

        // Summary counts
        const statusColor = results.failed.length > 0 ? '#dc2626' : '#16a34a';
        setStatus(
            `Done — ${results.created.length} created, ${results.skipped.length} skipped, ${results.failed.length} failed.`,
            statusColor
        );

        // Results CSV download
        const esc = v => { const s = String(v ?? ''); return (s.includes(',') || s.includes('"') || s.includes('\n')) ? '"' + s.replace(/"/g, '""') + '"' : s; };
        const allResultRows = [
            ...results.created.map(r => ({ ...r, status: 'Created', error: '' })),
            ...results.skipped.map(r => ({ row: r.row, name: r.name, id: '', ref: '', status: 'Skipped', error: r.reason })),
            ...results.failed.map(r => ({ row: r.row, name: r.name, id: '', ref: '', status: 'Failed', error: r.error })),
        ].sort((a, b) => a.row - b.row);
        const resultsCsv = [
            'Row,Name,Status,ID,Ref,Error',
            ...allResultRows.map(r => [r.row, r.name, r.status, r.id || '', r.ref || '', r.error || ''].map(esc).join(','))
        ].join('\n');
        const blobURL = URL.createObjectURL(new Blob([resultsCsv], { type: 'text/csv;charset=utf-8;' }));
        const fname = 'import_results_' + new Date().toISOString().slice(0, 10) + '.csv';

        // Summary table
        const td = 'padding:6px 10px;border:1px solid #e2e8f0;font-size:12px;';
        const th = td + 'background:#f1f5f9;font-weight:600;color:#374151;';
        const statusStyle = s => s === 'Created' ? 'color:#16a34a;font-weight:600;' : s === 'Failed' ? 'color:#dc2626;font-weight:600;' : 'color:#92400e;font-weight:600;';
        let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <thead><tr>
        <th style="${th}text-align:left;">Row</th>
        <th style="${th}text-align:left;">Name</th>
        <th style="${th}text-align:left;">Status</th>
        <th style="${th}text-align:left;">Note</th>
      </tr></thead><tbody>`;
        allResultRows.forEach(r => {
            tbl += `<tr>
          <td style="${td}">${r.row}</td>
          <td style="${td}">${escHtml(r.name)}</td>
          <td style="${td}${statusStyle(r.status)}">${r.status}</td>
          <td style="${td}color:#64748b;">${r.error ? escHtml(r.error) : (r.id ? 'ID: ' + r.id : '')}</td>
        </tr>`;
        });
        tbl += '</tbody></table>';

        $('cg-result').innerHTML = `
      <a href="${blobURL}" download="${fname}"
        style="display:block;text-align:center;background:#16a34a;color:#fff;padding:13px 16px;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:14px;"
        onclick="setTimeout(() => URL.revokeObjectURL(this.href), 10000)">
        ⬇&nbsp; Download ${fname}
      </a>
      <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:4px;">Import Results</div>
      ${tbl}`;

        this.disabled = false;
    };

})();
