(function ChronogolfImportUI() {

    const BATCH_SIZE = 3;
    const BATCH_DELAY_MS = 500;
    const { TD, TH, escHtml, escCsv, makeLogger } = window.SkylinksUtils;
    const log = makeLogger('CG Import');

    // SGC Topsheet column → API field mapping
    const TOPSHEET_FIELD_MAP = {
        'first name':     'first_name',
        'last name':      'last_name',
        'email':          'email',
        'phone':          'phone',
        'ghin':           'member_no',
        'street address': 'address_one',
        'city':           'city',
        'state':          'state_code',
        'zip code':       'post_code',
    };
    const GENDER_MAP = { male: 1, female: 2, m: 1, f: 2 };

    function isTopsheetFormat(rows) {
        if (!rows.length) return false;
        const keys = Object.keys(rows[0]);
        return keys.includes('first name') || keys.includes('membership tier');
    }

    function parseTopsheetDate(str) {
        if (!str) return '';
        const p = str.trim().split('/');
        if (p.length !== 3) return str;
        const [m, d, y] = p;
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    function normalizeTopsheetRow(row) {
        const normalized = { _lineNumber: row._lineNumber };
        for (const [src, dest] of Object.entries(TOPSHEET_FIELD_MAP)) {
            normalized[dest] = row[src] || '';
        }
        const genderKey = (row['gender'] || '').toLowerCase().trim();
        const genderInt = GENDER_MAP[genderKey];
        if (genderInt !== undefined) normalized.gender = String(genderInt);
        const dob = parseTopsheetDate(row['birthdate'] || '');
        if (dob) normalized.date_of_birth = dob;
        normalized.country_code = row['country code'] || 'US';
        const tierName = (row['membership tier'] || '').toLowerCase().trim();
        const tierId = affiliationTypesByName[tierName] ?? affiliationTypesByName[`sgc: ${tierName}`];
        normalized.affiliation_type_id = tierId !== undefined ? String(tierId) : '';
        return normalized;
    }

    // Resolve club ID from Angular app state in localStorage (reliable),
    // falling back to URL hash for pages where state hasn't loaded yet.
    function resolveClubId() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key?.startsWith('chronogolf.') && key.endsWith('.appState')) {
                    const state = JSON.parse(localStorage.getItem(key) || '{}');
                    if (state.organizationId) return String(state.organizationId);
                }
            }
        } catch (e) { /* fall through */ }
        return window.location.hash.match(/\/clubs\/(\d+)/)?.[1] || null;
    }

    const CLUB_ID = resolveClubId();

    if (!CLUB_ID) {
        alert('Skylinks Tools: Could not detect Club ID. Navigate to a Lightspeed Golf club page first.');
        return;
    }

    document.getElementById('cg-import-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'cg-import-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);z-index:999999;display:flex;align-items:center;justify-content:center;font-family:"Segoe UI",Tahoma,Geneva,Verdana,sans-serif;';

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;padding:32px;max-width:560px;width:92%;max-height:90vh;overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,0.35);';

    card.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
      <span style="font-size:24px;">👥</span>
      <h2 style="margin:0;font-size:20px;font-weight:700;font-family:'Trebuchet MS','Segoe UI',Tahoma,sans-serif;color:#262b2f;">Customer Import</h2>
    </div>
    <p style="margin:0 0 12px 0;font-size:13px;color:#4b5563;line-height:1.5;">
      Upload a CSV to batch-create customers in Lightspeed Golf (Club ${CLUB_ID}).<br>
      <strong>SGC Topsheet format</strong> (First Name, Last Name, Email, Membership Tier, …) is auto-detected.<br>
      <strong>API format</strong>: required columns <strong>first_name, last_name, email, affiliation_type_id</strong>.
    </p>
    <div id="cg-aff-section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#475569;">
      Loading affiliation types…
    </div>
    <label id="cg-drop-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed #d1d5db;border-radius:10px;padding:28px 16px;cursor:pointer;background:#f8fafc;margin-bottom:16px;transition:border-color .2s;">
      <span style="font-size:28px;">📂</span>
      <span style="font-size:13px;font-weight:600;color:#262b2f;">Choose CSV file or drag &amp; drop</span>
      <span id="cg-filename" style="font-size:12px;color:#94a3b8;">No file selected</span>
      <input id="cg-file" type="file" accept=".csv,text/csv" style="display:none;" />
    </label>
    <div id="cg-preflight" style="display:none;margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:12px;"></div>
    <button id="cg-run" disabled
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;opacity:0.4;">
      Start Import
    </button>
    <div id="cg-status" style="margin-top:14px;font-size:13px;min-height:20px;color:#475569;"></div>
    <div id="cg-progress" style="display:none;margin-top:10px;">
      <div style="background:#e2e8f0;border-radius:99px;height:6px;overflow:hidden;">
        <div id="cg-bar" style="background:#eeb02b;height:100%;width:0%;transition:width .3s;border-radius:99px;"></div>
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
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    $('cg-close').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };

    // CSRF token: prefer Angular injector (authoritative), fall back to cookie.
    function getCsrfToken() {
        try {
            const token = angular.element(document.body).injector()
                .get('$http').defaults.headers.common['X-CSRF-Token'];
            if (token) return token;
        } catch (e) { /* not available */ }
        return document.querySelector('meta[name="csrf-token"]')?.content
            || decodeURIComponent(document.cookie.match(/(?:^|;\s*)XSRF-TOKEN=([^;]+)/)?.[1] || '');
    }

    function cgFetch(path, opts = {}) {
        const { headers: extraHeaders, ...rest } = opts;
        return fetch(window.location.origin + path, {
            credentials: 'include',
            headers: { 'Accept': 'application/json', 'X-CSRF-Token': getCsrfToken(), ...extraHeaders },
            ...rest,
        });
    }

    // CSV parser — handles quoted fields and normalizes \r\n / \r line endings.
    function parseCSV(text) {
        const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = normalized.trim().split('\n').map(l => l.trim()).filter(l => l);
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

    async function createCustomer(payload) {
        try {
            const r = await cgFetch(`/private_api/clubs/${CLUB_ID}/customers`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': getCsrfToken() },
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

    // ── Init: load affiliation types + existing emails concurrently ──────────

    let existingEmails = null; // null=loading, Set=ready, false=unavailable
    let affiliationTypesByName = {}; // lowercase name → id, for Topsheet format resolution
    let csvText = null;
    let parsedRows = null;

    async function loadAffiliationTypes() {
        try {
            const r = await cgFetch(`/private_api/organizations/${CLUB_ID}/affiliation_types`);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const types = await r.json();
            if (!Array.isArray(types) || types.length === 0) {
                $('cg-aff-section').textContent = 'No affiliation types found.';
                return;
            }
            types.forEach(t => {
                const name = (t.name || t.label || '').toLowerCase().trim();
                if (name) affiliationTypesByName[name] = t.id;
            });
            let html = '<strong style="color:#262b2f;">Affiliation Types</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">';
            types.forEach(t => {
                html += `<span style="background:#e2e8f0;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;">${escHtml(t.id)} — ${escHtml(t.name || t.label || '')}</span>`;
            });
            html += '</div>';
            $('cg-aff-section').innerHTML = html;
            log(`Loaded ${types.length} affiliation type(s).`);
        } catch (e) {
            $('cg-aff-section').textContent = 'Could not load affiliation types.';
            log('Affiliation types fetch failed:', e.message);
        }
    }

    async function loadExistingEmails() {
        const emails = new Set();
        try {
            let page = 1;
            while (true) {
                const r = await cgFetch(`/private_api/clubs/${CLUB_ID}/customers?page=${page}&per_page=100`);
                if (!r.ok) break;
                const data = await r.json();
                if (!Array.isArray(data) || data.length === 0) break;
                data.forEach(c => { if (c.email) emails.add(c.email.toLowerCase()); });
                if (data.length < 100) break;
                page++;
            }
            existingEmails = emails;
            log(`Indexed ${emails.size} existing customer email(s).`);
        } catch (e) {
            existingEmails = false;
            log('Existing email pre-load failed:', e.message);
        }
    }

    // Start both loads immediately; don't block the UI.
    loadAffiliationTypes();
    loadExistingEmails();

    // ── File handling ─────────────────────────────────────────────────────────

    function handleFile(file) {
        if (!file) return;
        file.text().then(text => {
            csvText = text;
            parsedRows = null;
            $('cg-filename').textContent = file.name;
            $('cg-drop-zone').style.borderColor = '#eeb02b';

            // Pre-flight: parse + validate immediately on file select
            try {
                const raw = parseCSV(csvText);
                if (isTopsheetFormat(raw)) {
                    log('Detected SGC Topsheet format — normalizing columns.');
                    parsedRows = raw.map(normalizeTopsheetRow);
                } else {
                    parsedRows = raw;
                }
            } catch (e) {
                showPreflight([{ type: 'error', msg: 'CSV parse error: ' + e.message }]);
                return;
            }

            const issues = [];
            parsedRows.forEach(row => {
                const errs = validateRow(row);
                if (errs.length) issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: ${errs.join(', ')}` });
            });

            const validCount = parsedRows.length - issues.length;
            const summary = { type: issues.length ? 'warn' : 'ok', msg: `${parsedRows.length} rows parsed — ${validCount} valid, ${issues.length} will be skipped.` };
            showPreflight([summary, ...issues]);

            $('cg-run').disabled = false;
            $('cg-run').style.opacity = '1';
            setStatus(`Ready — ${file.name}`);
        });
    }

    function showPreflight(items) {
        const pf = $('cg-preflight');
        const hasError = items.some(i => i.type === 'error');
        const hasWarn = items.some(i => i.type === 'warn');
        pf.style.background = hasError ? '#fef2f2' : hasWarn ? '#fffbeb' : '#f0fdf4';
        pf.style.borderLeft = `3px solid ${hasError ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a'}`;
        pf.innerHTML = items.map(i => `<div style="color:${i.type === 'error' ? '#dc2626' : i.type === 'warn' ? '#92400e' : '#166534'};margin-bottom:2px;">${escHtml(i.msg)}</div>`).join('');
        css('cg-preflight', 'display', 'block');
    }

    $('cg-drop-zone').onclick = () => $('cg-file').click();
    $('cg-file').onchange = e => handleFile(e.target.files[0]);
    $('cg-drop-zone').ondragover = e => { e.preventDefault(); $('cg-drop-zone').style.borderColor = '#eeb02b'; };
    $('cg-drop-zone').ondragleave = () => { if (!csvText) $('cg-drop-zone').style.borderColor = '#d1d5db'; };
    $('cg-drop-zone').ondrop = e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

    // ── Import handler ────────────────────────────────────────────────────────

    $('cg-run').onclick = async function () {
        if (!parsedRows) return;

        this.disabled = true;
        $('cg-result').innerHTML = '';
        css('cg-progress', 'display', 'block');
        setProgress(0);
        log(`Starting import of ${parsedRows.length} rows for club ${CLUB_ID}`);

        const results = { created: [], skipped: [], failed: [] };

        // Separate valid from invalid rows up front
        const validRows = [];
        parsedRows.forEach(row => {
            const errors = validateRow(row);
            if (errors.length) {
                results.skipped.push({ row: row._lineNumber, name: `${row.first_name} ${row.last_name}`, reason: errors.join(', ') });
            } else {
                validRows.push(row);
            }
        });

        // Batched concurrent import
        for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
            const batch = validRows.slice(i, Math.min(i + BATCH_SIZE, validRows.length));
            const pct = Math.round((i / validRows.length) * 90);
            setProgress(pct);
            setStatus(`Processing ${i + 1}–${Math.min(i + BATCH_SIZE, validRows.length)} of ${validRows.length} valid rows…`);

            await Promise.all(batch.map(async row => {
                const name = `${row.first_name} ${row.last_name}`;

                // Skip duplicates if email index is ready
                if (existingEmails instanceof Set && existingEmails.has(row.email.toLowerCase())) {
                    log(`SKIPPED (duplicate) row ${row._lineNumber} (${name})`);
                    results.skipped.push({ row: row._lineNumber, name, reason: 'email already exists' });
                    return;
                }

                const result = await createCustomer(buildPayload(row));
                if (result.success) {
                    log(`CREATED row ${row._lineNumber} (${name}) → ID: ${result.id}`);
                    results.created.push({ row: row._lineNumber, name, id: result.id, ref: result.ref });
                } else {
                    log(`FAILED row ${row._lineNumber} (${name}) → ${result.status}: ${result.message}`);
                    results.failed.push({ row: row._lineNumber, name, error: result.message });
                }
            }));

            if (i + BATCH_SIZE < validRows.length) await sleep(BATCH_DELAY_MS);
        }

        setProgress(100);
        const statusColor = results.failed.length > 0 ? '#dc2626' : '#16a34a';
        setStatus(
            `Done — ${results.created.length} created, ${results.skipped.length} skipped, ${results.failed.length} failed.`,
            statusColor
        );
        log(`Import complete. Created: ${results.created.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);

        // Results CSV
        const allResultRows = [
            ...results.created.map(r => ({ ...r, status: 'Created', error: '' })),
            ...results.skipped.map(r => ({ row: r.row, name: r.name, id: '', ref: '', status: 'Skipped', error: r.reason })),
            ...results.failed.map(r => ({ row: r.row, name: r.name, id: '', ref: '', status: 'Failed', error: r.error })),
        ].sort((a, b) => a.row - b.row);

        const resultsCsv = [
            'Row,Name,Status,ID,Ref,Error',
            ...allResultRows.map(r => [r.row, r.name, r.status, r.id || '', r.ref || '', r.error || ''].map(escCsv).join(','))
        ].join('\n');
        const blobURL = URL.createObjectURL(new Blob([resultsCsv], { type: 'text/csv;charset=utf-8;' }));
        const fname = 'import_results_' + new Date().toISOString().slice(0, 10) + '.csv';

        // Results table
        const statusStyle = s => s === 'Created' ? 'color:#16a34a;font-weight:600;' : s === 'Failed' ? 'color:#dc2626;font-weight:600;' : 'color:#92400e;font-weight:600;';
        let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <thead><tr>
        <th style="${TH}text-align:left;">Row</th>
        <th style="${TH}text-align:left;">Name</th>
        <th style="${TH}text-align:left;">Status</th>
        <th style="${TH}text-align:left;">Note</th>
      </tr></thead><tbody>`;
        allResultRows.forEach(r => {
            tbl += `<tr>
          <td style="${TD}">${r.row}</td>
          <td style="${TD}">${escHtml(r.name)}</td>
          <td style="${TD}${statusStyle(r.status)}">${r.status}</td>
          <td style="${TD}color:#64748b;">${r.error ? escHtml(r.error) : (r.id ? 'ID: ' + r.id : '')}</td>
        </tr>`;
        });
        tbl += '</tbody></table>';

        $('cg-result').innerHTML = `
      <a href="${blobURL}" download="${fname}"
        style="display:block;text-align:center;background:#eeb02b;color:#1c1b19;padding:13px 16px;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:14px;"
        onclick="setTimeout(() => URL.revokeObjectURL(this.href), 10000)">
        ⬇&nbsp; Download ${fname}
      </a>
      <div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Import Results</div>
      ${tbl}`;

        this.disabled = false;
    };

})();
