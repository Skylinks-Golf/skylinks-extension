(function LightspeedRetailCustomerTypeSyncUI() {
  if (document.getElementById('cts-overlay')) return;

  const BATCH_SIZE = 5;
  const BATCH_DELAY_MS = 300;
  const { escHtml, makeLogger, createModal, apiClient, paginate, csv, download, dom, runPreflight, SkylinksError, ErrorCode, config } = window.SkylinksUtils;
  const log = makeLogger('LS Customer Type Sync');

  const TH_STYLE = 'padding:6px 8px;border-bottom:2px solid #d1d5db;';
  const TD_STYLE = 'padding:6px 8px;border-bottom:1px solid #e2e8f0;';

  const ACCOUNT_ID = window.location.pathname.match(/\/Account\/(\d+)/)?.[1] || config.lightspeed.fallbackAccountId;
  const PAGE_SIZE = config.lightspeed.pagination.pageSize;

  const api = apiClient({
    baseUrl: `${config.lightspeed.baseUrl}/API/Account/${ACCOUNT_ID}`,
    auth: 'cookie',
    retry: { attempts: 2, delayMs: 1000, methods: ['GET'] },
  });

  // Retail's Contact relation shape isn't publicly documented for this account;
  // handle the common variants (array or single object, wrapped or bare) rather
  // than assuming one. See docs/api_refs/lightspeed_retail_01.md.
  function extractContactEmail(contact) {
    if (!contact) return null;
    const raw = contact.Emails?.ContactEmail ?? contact.Emails ?? contact.email;
    const list = dom.toArr(raw);
    if (!list.length) return null;
    const primary = list.find(e => e && (e.useType === 'Primary' || e.useType === 'primary')) || list[0];
    const address = typeof primary === 'string' ? primary : primary?.address;
    return address ? address.toLowerCase().trim() : null;
  }

  function validateRow(row) {
    const errors = [];
    if (!row.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('invalid or missing email');
    if (!row.tier) errors.push('missing membership tier');
    return errors;
  }

  // Golf's affiliation types use "SGC: X"; Retail's customer types use "SGC - X"
  // per staff. Try both plus the bare tier name so this doesn't hard-fail if
  // either side's naming convention drifts.
  function resolveCustomerTypeId(tier) {
    const key = (tier || '').toLowerCase().trim();
    if (!key) return undefined;
    return customerTypesByName[key]
      ?? customerTypesByName[`sgc - ${key}`]
      ?? customerTypesByName[`sgc: ${key}`]
      ?? customerTypesByName[`sgc ${key}`];
  }

  const BODY_HTML = `
    <div id="cts-type-section" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:12px;color:#475569;">
      Loading customer types…
    </div>
    <label id="cts-drop-zone" style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;border:2px dashed #d1d5db;border-radius:10px;padding:28px 16px;cursor:pointer;background:#f8fafc;margin-bottom:16px;transition:border-color .2s;">
      <span style="font-size:28px;">🔄</span>
      <span style="font-size:13px;font-weight:600;color:#262b2f;">Choose CSV file or drag &amp; drop</span>
      <span id="cts-filename" style="font-size:12px;color:#94a3b8;">No file selected</span>
      <input id="cts-file" type="file" accept=".csv,text/csv" style="display:none;" />
    </label>
    <div id="cts-preflight" style="display:none;margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:12px;"></div>
    <button id="cts-run" disabled
      style="width:100%;background:#eeb02b;color:#1c1b19;border:none;padding:13px;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;opacity:0.4;">
      Start Sync
    </button>`;

  const modal = createModal({
    id: 'cts',
    title: 'Sync Customer Type',
    emoji: '🔄',
    description: `Upload the same SGC Topsheet CSV used for Golf import (Email, Membership Tier). Matches existing Retail customers by email and sets their Customer Type to match — never creates a Retail profile (Lightspeed creates those automatically from the Golf import).`,
    body: BODY_HTML,
    runLabel: null,
  });

  const $ = id => document.getElementById(id);

  // ── Init: load customer types + existing customers concurrently ────────────

  let existingByEmail = null;      // null=loading, Map<email,{id,customerTypeID}>=ready, false=unavailable
  let customerTypesByName = {};    // lowercase name → customerTypeID
  let parsedRows = null;

  async function loadCustomerTypes() {
    try {
      const resp = await api.get('/CustomerType.json');
      const types = dom.toArr(resp.CustomerType);
      if (!types.length) {
        $('cts-type-section').textContent = 'No customer types found.';
        return;
      }
      types.forEach(t => {
        const name = (t.name || '').toLowerCase().trim();
        if (name) customerTypesByName[name] = parseInt(t.customerTypeID, 10);
      });
      let html = '<strong style="color:#262b2f;">Retail Customer Types</strong><div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;">';
      types.forEach(t => {
        html += `<span style="background:#e2e8f0;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:600;">${escHtml(t.customerTypeID)} — ${escHtml(t.name || '')}</span>`;
      });
      html += '</div>';
      $('cts-type-section').innerHTML = html;
      log(`Loaded ${types.length} customer type(s).`);
    } catch (e) {
      $('cts-type-section').textContent = 'Could not load customer types.';
      log('Customer types fetch failed:', e.message);
    }
  }

  async function loadExistingCustomers() {
    try {
      const customers = await paginate({
        fetchPage: cur => api.get(`/Customer.json?load_relations=${encodeURIComponent('["Contact"]')}&limit=${PAGE_SIZE}&offset=${cur}`),
        getItems: r => dom.toArr(r.Customer),
        getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
        pageSize: PAGE_SIZE,
        parallel: true,
        maxConcurrent: 10,
      });
      const map = new Map();
      customers.forEach(c => {
        const email = extractContactEmail(c.Contact);
        if (email) map.set(email, { id: c.customerID, customerTypeID: c.customerTypeID });
      });
      // If nobody has a resolvable email, the Contact shape assumption is
      // probably wrong for this account — refuse to run blind rather than
      // silently "not found"-ing every row.
      existingByEmail = (customers.length && map.size === 0) ? false : map;
      log(`Indexed ${map.size} of ${customers.length} Retail customer(s) with a usable email.`);
    } catch (e) {
      existingByEmail = false;
      log('Existing customer pre-load failed:', e.message);
    }
  }

  loadCustomerTypes();
  loadExistingCustomers();

  // ── File handling ────────────────────────────────────────────────────────

  function handleFile(file) {
    if (!file) return;
    file.text().then(text => {
      parsedRows = null;
      $('cts-filename').textContent = file.name;
      $('cts-drop-zone').style.borderColor = '#eeb02b';

      let raw;
      try {
        raw = csv.parseCSV(text);
      } catch (e) {
        showPreflight([{ type: 'error', msg: 'CSV parse error: ' + e.message }]);
        return;
      }

      if (!raw.length || !('email' in raw[0]) || !('membership tier' in raw[0])) {
        showPreflight([{ type: 'error', msg: 'This doesn’t look like the SGC Topsheet CSV — expected "Email" and "Membership Tier" columns.' }]);
        return;
      }

      parsedRows = raw.map(row => ({
        _lineNumber: row._lineNumber,
        email: (row['email'] || '').trim(),
        tier: (row['membership tier'] || '').trim(),
        name: `${row['first name'] || ''} ${row['last name'] || ''}`.trim(),
      }));

      const issues = [];
      let skipCount = 0;
      parsedRows.forEach(row => {
        const errs = validateRow(row);
        if (errs.length) {
          skipCount++;
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: ${errs.join(', ')}` });
          return;
        }
        if (resolveCustomerTypeId(row.tier) === undefined) {
          skipCount++;
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: no Retail customer type matches membership tier "${row.tier}".` });
        }
      });

      const validCount = parsedRows.length - skipCount;
      const summary = { type: issues.length ? 'warn' : 'ok', msg: `${parsedRows.length} rows parsed — ${validCount} valid, ${skipCount} will be skipped.` };
      showPreflight([summary, ...issues]);

      $('cts-run').disabled = false;
      $('cts-run').style.opacity = '1';
      modal.setStatus(`Ready — ${file.name}`);
    });
  }

  function showPreflight(items) {
    const pf = $('cts-preflight');
    const hasError = items.some(i => i.type === 'error');
    const hasWarn = items.some(i => i.type === 'warn');
    pf.style.background = hasError ? '#fef2f2' : hasWarn ? '#fffbeb' : '#f0fdf4';
    pf.style.borderLeft = `3px solid ${hasError ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a'}`;
    pf.innerHTML = items.map(i =>
      `<div style="color:${i.type === 'error' ? '#dc2626' : i.type === 'warn' ? '#92400e' : '#166534'};margin-bottom:2px;">${escHtml(i.msg)}</div>`
    ).join('');
    pf.style.display = 'block';
  }

  $('cts-drop-zone').onclick = () => $('cts-file').click();
  $('cts-file').onchange = e => handleFile(e.target.files[0]);
  $('cts-drop-zone').ondragover = e => { e.preventDefault(); $('cts-drop-zone').style.borderColor = '#eeb02b'; };
  $('cts-drop-zone').ondragleave = () => { if (!parsedRows) $('cts-drop-zone').style.borderColor = '#d1d5db'; };
  $('cts-drop-zone').ondrop = e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  // ── Sync handler ─────────────────────────────────────────────────────────

  $('cts-run').onclick = async function () {
    if (!parsedRows) return;

    this.disabled = true;

    try {
      await runPreflight({
        name: 'Customer Types',
        checkFn: async () => {
          const resp = await api.get('/CustomerType.json');
          const list = dom.toArr(resp.CustomerType);
          if (!list.length) throw new SkylinksError({ code: ErrorCode.SCHEMA, message: 'No customer types returned.', detail: 'CustomerType.json returned empty or non-array response.' });
          return list;
        },
        expectedKeys: [],
      });
    } catch (err) {
      showPreflight([{ type: 'error', msg: 'Preflight failed: ' + (err.message || 'Unknown error') }]);
      this.disabled = false;
      return;
    }

    if (existingByEmail === false) {
      showPreflight([{ type: 'error', msg: 'Could not build the Retail customer/email index (see console) — refusing to run blind. Reload the page and try again.' }]);
      this.disabled = false;
      return;
    }
    if (existingByEmail === null) {
      showPreflight([{ type: 'error', msg: 'Still indexing existing Retail customers — wait a few seconds and try again.' }]);
      this.disabled = false;
      return;
    }

    modal.resetResult();
    modal.setProgress(0);
    log(`Starting customer type sync of ${parsedRows.length} rows`);

    const results = { updated: [], skipped: [], notFound: [], failed: [] };

    const validRows = [];
    parsedRows.forEach(row => {
      const errors = validateRow(row);
      if (errors.length) {
        results.skipped.push({ row: row._lineNumber, name: row.name || row.email, reason: errors.join(', ') });
        return;
      }
      const typeId = resolveCustomerTypeId(row.tier);
      if (typeId === undefined) {
        results.skipped.push({ row: row._lineNumber, name: row.name || row.email, reason: `no Retail customer type matches "${row.tier}"` });
        return;
      }
      validRows.push({ ...row, _typeId: typeId });
    });

    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, Math.min(i + BATCH_SIZE, validRows.length));
        modal.setProgress(Math.round((i / validRows.length) * 90));
        modal.setStatus(`Processing ${i + 1}–${Math.min(i + BATCH_SIZE, validRows.length)} of ${validRows.length} valid rows…`);

        await Promise.all(batch.map(async row => {
          const displayName = row.name || row.email;
          const existing = existingByEmail.get(row.email.toLowerCase());

          if (!existing) {
            log(`NOT FOUND row ${row._lineNumber} (${row.email})`);
            results.notFound.push({ row: row._lineNumber, name: displayName, reason: 'no Retail customer with this email — confirm the Golf profile was created first' });
            return;
          }

          if (parseInt(existing.customerTypeID, 10) === row._typeId) {
            results.skipped.push({ row: row._lineNumber, name: displayName, reason: 'customer type already correct' });
            return;
          }

          try {
            await api.put(`/Customer/${existing.id}.json`, { customerTypeID: row._typeId });
            log(`UPDATED row ${row._lineNumber} (${row.email}) → customerTypeID ${row._typeId}`);
            results.updated.push({ row: row._lineNumber, name: displayName, id: existing.id });
          } catch (e) {
            log(`FAILED row ${row._lineNumber} (${row.email}) → ${e.message}`);
            results.failed.push({ row: row._lineNumber, name: displayName, error: e.message });
          }
        }));

        if (i + BATCH_SIZE < validRows.length) await dom.sleep(BATCH_DELAY_MS);
      }
    } catch (err) {
      modal.setStatus('❌ Error: ' + err.message, 'error');
      console.error('[LS Customer Type Sync] Error:', err);
      this.disabled = false;
      return;
    }

    modal.setProgress(100);
    modal.setStatus(
      `Done — ${results.updated.length} updated, ${results.skipped.length} skipped, ${results.notFound.length} not found, ${results.failed.length} failed.`,
      results.failed.length > 0 ? 'error' : 'success'
    );
    log(`Sync complete. Updated: ${results.updated.length}, Skipped: ${results.skipped.length}, Not found: ${results.notFound.length}, Failed: ${results.failed.length}`);

    // Results CSV + table
    const allResultRows = [
      ...results.updated.map(r => ({ row: r.row, name: r.name, status: 'Updated', error: '' })),
      ...results.skipped.map(r => ({ row: r.row, name: r.name, status: 'Skipped', error: r.reason })),
      ...results.notFound.map(r => ({ row: r.row, name: r.name, status: 'Not Found', error: r.reason })),
      ...results.failed.map(r => ({ row: r.row, name: r.name, status: 'Failed', error: r.error })),
    ].sort((a, b) => a.row - b.row);

    const RESULT_COLS = [
      { header: 'Row', value: r => String(r.row) },
      { header: 'Name', value: r => r.name },
      { header: 'Status', value: r => r.status },
      { header: 'Note', value: r => r.error || '' },
    ];
    const fname = 'customer_type_sync_' + new Date().toISOString().slice(0, 10) + '.csv';
    const dlBtn = download.csvButton({ csv: csv.toCSV(allResultRows, RESULT_COLS), filename: fname });

    const statusStyle = s => s === 'Updated' ? 'color:#16a34a;font-weight:600;' : s === 'Failed' ? 'color:#dc2626;font-weight:600;' : s === 'Not Found' ? 'color:#dc2626;font-weight:600;' : 'color:#92400e;font-weight:600;';
    let tbl = `<table style="width:100%;border-collapse:collapse;margin-top:4px;">
      <thead><tr>
        <th style="${TH_STYLE}text-align:left;">Row</th>
        <th style="${TH_STYLE}text-align:left;">Name</th>
        <th style="${TH_STYLE}text-align:left;">Status</th>
        <th style="${TH_STYLE}text-align:left;">Note</th>
      </tr></thead><tbody>`;
    allResultRows.forEach(r => {
      tbl += `<tr>
          <td style="${TD_STYLE}">${r.row}</td>
          <td style="${TD_STYLE}">${escHtml(r.name)}</td>
          <td style="${TD_STYLE}${statusStyle(r.status)}">${r.status}</td>
          <td style="${TD_STYLE}color:#64748b;">${r.error ? escHtml(r.error) : ''}</td>
        </tr>`;
    });
    tbl += '</tbody></table>';

    dlBtn.style.cssText += 'display:block;text-align:center;margin-bottom:14px;';
    const result = document.createElement('div');
    result.appendChild(dlBtn);
    result.insertAdjacentHTML('beforeend',
      `<div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Sync Results</div>${tbl}`
    );
    modal.showResult(result);

    this.disabled = false;
  };

})();
