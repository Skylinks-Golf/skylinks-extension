(function ChronogolfImportUI() {

  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 500;
  const { TD, TH, escHtml, escCsv, makeLogger, createModal, apiClient, paginate, csv, download, dom, runPreflight, SkylinksError } = window.SkylinksUtils;
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
    const [m, d] = p;
    let y = p[2];
    if (y.length === 2) {
      const yy = parseInt(y, 10);
      y = String(yy <= 30 ? 2000 + yy : 1900 + yy);
    }
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

  function getCsrfToken() {
    for (const s of document.querySelectorAll('script:not([src])')) {
      const m = s.textContent.match(/"CSRF_TOKEN"\s*:\s*"([^"]+)"/);
      if (m) return m[1];
    }
    // Fallback: Angular injector works if script runs in MAIN world
    try {
      const token = angular.element(document.body).injector()
        .get('$http').defaults.headers.common['X-CSRF-Token'];
      if (token) return token;
    } catch (e) { /* isolated world — angular not accessible */ }
    return '';
  }

  const api = apiClient({
    baseUrl: window.location.origin,
    auth: { csrf: getCsrfToken },
    defaultHeaders: { Accept: 'application/json' },
  });

  function validateRow(row) {
    const errors = [];
    if (!row.first_name) errors.push('first_name required');
    if (!row.last_name) errors.push('last_name required');
    if (!row.email) errors.push('email required');
    if (!row.affiliation_type_id || isNaN(parseInt(row.affiliation_type_id, 10))) errors.push('affiliation_type_id must be a number');
    return errors;
  }

  // Player type is NOT a customer field — it's set via a separate affiliation
  // call after create (see attachAffiliation). Address must be nested under
  // `address` with the server's `postcode` key (not the form's `post_code`).
  function buildPayload(row) {
    const customer = {
      club_id: parseInt(CLUB_ID, 10),
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email,
    };
    if (row.phone) customer.phone = normalizePhone(row.phone);
    if (row.gender) customer.gender = parseInt(row.gender, 10);
    if (row.date_of_birth) customer.date_of_birth = row.date_of_birth;
    const memberNo = row.ghin || row.member_no;
    if (memberNo) customer.member_no = memberNo;
    if (row.bag_number) customer.bag_number = row.bag_number;

    const address = buildAddressPatch(row);
    if (Object.keys(address).length) customer.address = address;

    return { customer };
  }

  // Lightspeed's phone field is digits-only in practice; strip formatting
  // (parens, dashes, spaces, +) rather than sending it through unchanged.
  function normalizePhone(phone) {
    return String(phone).replace(/\D/g, '');
  }

  function buildAddressPatch(row) {
    const address = {};
    if (row.address_one) address.address_one = row.address_one;
    if (row.address_two) address.address_two = row.address_two;
    if (row.city) address.city = row.city;
    if (row.country_code) address.country_code = row.country_code.toUpperCase();
    if (row.state_code) address.state_code = row.state_code;
    if (row.post_code) address.postcode = row.post_code;
    return address;
  }

  async function createCustomer(payload) {
    let r;
    try {
      r = await api.raw(`/private_api/clubs/${CLUB_ID}/customers`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfToken(),
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      log('Network error:', e.message);
      return { success: false, status: 0, message: `Network error: ${e.message}` };
    }

    if (!r.ok) {
      const text = await r.text().catch(() => '');
      let msg = `HTTP ${r.status}`;
      try {
        const data = JSON.parse(text);
        msg = data.errors ? data.errors.map(e => e.message).join('; ') : (data.error?.message || msg);
      } catch (_) {
        if (text) msg += ` — ${text.slice(0, 120)}`;
      }
      log(`POST failed ${r.status}:`, msg);
      return { success: false, status: r.status, message: msg };
    }

    try {
      const data = await r.json();
      return { success: true, id: data.id, ref: data.ref };
    } catch (e) {
      return { success: false, status: r.status, message: `Created but could not parse response: ${e.message}` };
    }
  }

  // Player type = affiliation, set via a separate call (doc §2b/§5). Always use
  // the type's own default_role rather than guessing 'member'/'public'.
  async function attachAffiliation(customerId, affiliationTypeId) {
    const type = affiliationTypesById[affiliationTypeId];
    const role = type?.default_role || 'public';
    try {
      await api.post(`/private_api/organizations/${CLUB_ID}/affiliations`, {
        affiliation: {
          affiliation_type_id: affiliationTypeId,
          role,
          organization_id: parseInt(CLUB_ID, 10),
          provider_id: parseInt(CLUB_ID, 10),
          user_id: customerId,
        },
      });
      return { success: true };
    } catch (e) {
      log('Affiliation attach failed:', e.message);
      return { success: false, message: e.message };
    }
  }

  // Existing customer (matched by email): read-modify-write the profile (doc §3a —
  // round-trip the full object, only patch fields this row actually supplies so we
  // never blank out data staff entered manually), then update the player type via
  // the affiliation endpoint (§3b) if it differs and isn't subscription-locked.
  async function updateExistingCustomer(customerId, row) {
    let customer;
    try {
      customer = await api.get(`/private_api/clubs/${CLUB_ID}/customers/${customerId}`, { query: { club_id: CLUB_ID } });
    } catch (e) {
      return { success: false, message: `Could not read existing customer: ${e.message}` };
    }

    if (row.phone) customer.phone = normalizePhone(row.phone);
    if (row.gender) customer.gender = parseInt(row.gender, 10);
    if (row.date_of_birth) customer.date_of_birth = row.date_of_birth;
    const memberNo = row.ghin || row.member_no;
    if (memberNo) customer.member_no = memberNo;
    if (row.bag_number) customer.bag_number = row.bag_number;

    const addressPatch = buildAddressPatch(row);
    if (Object.keys(addressPatch).length) {
      customer.address = { ...(customer.address || {}), ...addressPatch };
    }

    try {
      await api.put(`/private_api/clubs/${CLUB_ID}/customers/${customerId}`, { customer });
    } catch (e) {
      return { success: false, message: `Profile update failed: ${e.message}` };
    }

    const desiredTypeId = row.affiliation_type_id ? parseInt(row.affiliation_type_id, 10) : null;
    if (!desiredTypeId) return { success: true, playerTypeUpdated: false };

    if (customer.player_type_locked_by_subscription) {
      return { success: true, playerTypeUpdated: false, playerTypeNote: 'locked by subscription' };
    }

    const current = customer.current_affiliation;
    if (current && current.affiliation_type_id === desiredTypeId) {
      return { success: true, playerTypeUpdated: false };
    }

    const type = affiliationTypesById[desiredTypeId];
    const role = type?.default_role || 'public';

    try {
      if (current) {
        const affiliation = {
          id: current.id,
          role,
          organization_id: parseInt(CLUB_ID, 10),
          provider_id: parseInt(CLUB_ID, 10),
          affiliation_type_id: desiredTypeId,
          user_id: customerId,
        };
        if (orgInfo) {
          affiliation.owner = { id: orgInfo.id, name: orgInfo.name, type: 'Club' };
          affiliation.provider = { id: orgInfo.id, name: orgInfo.name, type: 'Club' };
        }
        await api.put(`/private_api/affiliations/${current.id}`, { affiliation });
      } else {
        await api.post(`/private_api/organizations/${CLUB_ID}/affiliations`, {
          affiliation: {
            affiliation_type_id: desiredTypeId,
            role,
            organization_id: parseInt(CLUB_ID, 10),
            provider_id: parseInt(CLUB_ID, 10),
            user_id: customerId,
          },
        });
      }
      return { success: true, playerTypeUpdated: true };
    } catch (e) {
      log('Affiliation update failed:', e.message);
      return { success: true, playerTypeUpdated: false, playerTypeNote: e.message };
    }
  }

  // Exact-match lookup (doc §1a) — used when a create attempt comes back
  // "already a customer" because our in-memory index was built before this
  // session created/found that customer.
  async function findCustomerIdByEmail(email) {
    try {
      const q = `((user.email:${email}))`;
      const hits = await api.get(`/private_api/clubs/${CLUB_ID}/customers`, { query: { club_id: CLUB_ID, page: 1, q } });
      const match = Array.isArray(hits) ? hits.find(c => c.email?.toLowerCase() === email.toLowerCase()) : null;
      return match ? match.id : null;
    } catch (e) {
      log('Customer lookup by email failed:', e.message);
      return null;
    }
  }

  const BODY_HTML = `
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
    </button>`;

  const modal = createModal({
    id: 'cg-import',
    title: 'Customer Import',
    emoji: '👥',
    description: `Upload a CSV to batch-create or update customers in Lightspeed Golf (Club ${CLUB_ID}). Rows matching an existing email update that customer instead of skipping it. SGC Topsheet format (First Name, Last Name, Email, Membership Tier, …) is auto-detected. API format: required columns first_name, last_name, email, affiliation_type_id.`,
    body: BODY_HTML,
    runLabel: null,
  });

  const $ = id => document.getElementById(id);

  // ── Init: load affiliation types + existing customers concurrently ──────────

  let existingCustomersByEmail = null; // null=loading, Map<email,id>=ready, false=unavailable
  let affiliationTypesByName = {};     // lowercase name → id, for Topsheet format resolution
  let affiliationTypesById = {};       // id → full type object (need default_role for writes)
  let orgInfo = null;                  // {id, name}, used to fill owner/provider on affiliation PUTs
  let parsedRows = null;

  async function loadAffiliationTypes() {
    try {
      const types = await api.get(`/private_api/organizations/${CLUB_ID}/affiliation_types`);
      if (!Array.isArray(types) || types.length === 0) {
        $('cg-aff-section').textContent = 'No affiliation types found.';
        return;
      }
      types.forEach(t => {
        const name = (t.name || t.label || '').toLowerCase().trim();
        if (name) affiliationTypesByName[name] = t.id;
        affiliationTypesById[t.id] = t;
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

  async function loadExistingCustomers() {
    try {
      const customers = await paginate({
        fetchPage: cur => api.get(`/private_api/clubs/${CLUB_ID}/customers?page=${cur}&per_page=100`),
        start: 1,
        getItems: r => Array.isArray(r) ? r : [],
        hasMore: (_, items) => items.length === 100,
        nextCursor: cur => cur + 1,
      });
      existingCustomersByEmail = new Map(
        customers.filter(c => c.email).map(c => [c.email.toLowerCase(), c.id])
      );
      log(`Indexed ${existingCustomersByEmail.size} existing customer(s).`);
    } catch (e) {
      existingCustomersByEmail = false;
      log('Existing customer pre-load failed:', e.message);
    }
  }

  async function loadOrgInfo() {
    try {
      const org = await api.get(`/private_api/organizations/${CLUB_ID}`);
      orgInfo = { id: org.id, name: org.name };
    } catch (e) {
      log('Org info fetch failed (affiliation updates will omit owner/provider):', e.message);
    }
  }

  loadAffiliationTypes();
  loadExistingCustomers();
  loadOrgInfo();

  // ── File handling ───────────────────────────────────────────────────────────

  function handleFile(file) {
    if (!file) return;
    file.text().then(text => {
      parsedRows = null;
      $('cg-filename').textContent = file.name;
      $('cg-drop-zone').style.borderColor = '#eeb02b';

      try {
        const raw = csv.parseCSV(text);
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

      const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
      const todayISO = new Date().toISOString().slice(0, 10);
      const oldestSaneISO = `${new Date().getFullYear() - 100}-01-01`;

      const issues = [];
      let invalidCount = 0;
      parsedRows.forEach(row => {
        const errs = validateRow(row);
        if (errs.length) {
          invalidCount++;
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: ${errs.join(', ')}` });
        }
        if (row.date_of_birth && !DOB_RE.test(row.date_of_birth)) {
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: birthdate "${row.date_of_birth}" isn't a valid date — it will likely be rejected or dropped.` });
        } else if (row.date_of_birth && (row.date_of_birth > todayISO || row.date_of_birth < oldestSaneISO)) {
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: birthdate ${row.date_of_birth} looks wrong (future-dated or 100+ years ago) — verify the source data.` });
        }
        if (row.ghin && row.member_no && row.ghin !== row.member_no) {
          issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: GHIN "${row.ghin}" and member_no "${row.member_no}" disagree — GHIN will be used as the member number.` });
        }
        if (row.phone) {
          const digits = row.phone.replace(/\D/g, '');
          if (digits !== row.phone) {
            issues.push({ type: 'ok', msg: `Row ${row._lineNumber}: phone "${row.phone}" will be sent as "${digits}" (formatting stripped).` });
          }
          if (digits.length < 7 || digits.length > 15) {
            issues.push({ type: 'warn', msg: `Row ${row._lineNumber}: phone "${row.phone}" has ${digits.length} digits after stripping — looks wrong, verify the source data.` });
          }
        }
      });

      const validCount = parsedRows.length - invalidCount;
      const summary = { type: issues.length ? 'warn' : 'ok', msg: `${parsedRows.length} rows parsed — ${validCount} valid, ${invalidCount} will be skipped.` };
      showPreflight([summary, ...issues]);

      $('cg-run').disabled = false;
      $('cg-run').style.opacity = '1';
      modal.setStatus(`Ready — ${file.name}`);
    });
  }

  function showPreflight(items) {
    const pf = $('cg-preflight');
    const hasError = items.some(i => i.type === 'error');
    const hasWarn  = items.some(i => i.type === 'warn');
    pf.style.background   = hasError ? '#fef2f2' : hasWarn ? '#fffbeb' : '#f0fdf4';
    pf.style.borderLeft   = `3px solid ${hasError ? '#dc2626' : hasWarn ? '#d97706' : '#16a34a'}`;
    pf.innerHTML = items.map(i =>
      `<div style="color:${i.type === 'error' ? '#dc2626' : i.type === 'warn' ? '#92400e' : '#166534'};margin-bottom:2px;">${escHtml(i.msg)}</div>`
    ).join('');
    pf.style.display = 'block';
  }

  $('cg-drop-zone').onclick = () => $('cg-file').click();
  $('cg-file').onchange    = e => handleFile(e.target.files[0]);
  $('cg-drop-zone').ondragover  = e => { e.preventDefault(); $('cg-drop-zone').style.borderColor = '#eeb02b'; };
  $('cg-drop-zone').ondragleave = () => { if (!parsedRows) $('cg-drop-zone').style.borderColor = '#d1d5db'; };
  $('cg-drop-zone').ondrop      = e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); };

  // ── Import handler ──────────────────────────────────────────────────────────

  $('cg-run').onclick = async function () {
    if (!parsedRows) return;

    this.disabled = true;
    // Preflight: CSRF token + affiliation types contract
    const csrf = getCsrfToken();
    if (!csrf) {
      showPreflight([{ type: 'error', msg: 'CSRF token not available. Please reload the page and try again.' }]);
      this.disabled = false;
      return;
    }
    try {
      await runPreflight({
        name:    'Affiliation Types',
        checkFn: async () => {
          const types = await api.get(`/private_api/organizations/${CLUB_ID}/affiliation_types`);
          if (!Array.isArray(types) || types.length === 0) throw new SkylinksError({ code: 'SCHEMA', message: 'No affiliation types returned.', detail: 'Endpoint returned empty or non-array response.' });
          return types;
        },
        expectedKeys: [],
      });
    } catch (err) {
      showPreflight([{ type: 'error', msg: 'Preflight failed: ' + (err.message || 'Unknown error') }]);
      this.disabled = false;
      return;
    }
    modal.resetResult();
    modal.setProgress(0);
    log(`Starting import of ${parsedRows.length} rows for club ${CLUB_ID}`);

    const results = { created: [], updated: [], skipped: [], failed: [] };

    async function handleUpdate(existingId, row, name) {
      const result = await updateExistingCustomer(existingId, row);
      if (result.success) {
        const note = result.playerTypeUpdated === false && row.affiliation_type_id
          ? (result.playerTypeNote ? `player type not updated: ${result.playerTypeNote}` : '')
          : '';
        log(`UPDATED row ${row._lineNumber} (${name}) → ID: ${existingId}${note ? ' — ' + note : ''}`);
        results.updated.push({ row: row._lineNumber, name, id: existingId, note });
      } else {
        log(`FAILED (update) row ${row._lineNumber} (${name}) → ${result.message}`);
        results.failed.push({ row: row._lineNumber, name, error: result.message });
      }
    }

    const validRows = [];
    parsedRows.forEach(row => {
      const errors = validateRow(row);
      if (errors.length) {
        results.skipped.push({ row: row._lineNumber, name: `${row.first_name} ${row.last_name}`, reason: errors.join(', ') });
      } else {
        validRows.push(row);
      }
    });

    try {
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = validRows.slice(i, Math.min(i + BATCH_SIZE, validRows.length));
        const pct = Math.round((i / validRows.length) * 90);
        modal.setProgress(pct);
        modal.setStatus(`Processing ${i + 1}–${Math.min(i + BATCH_SIZE, validRows.length)} of ${validRows.length} valid rows…`);

        await Promise.all(batch.map(async row => {
          const name = `${row.first_name} ${row.last_name}`;
          const emailKey = row.email.toLowerCase();

          if (existingCustomersByEmail instanceof Map && existingCustomersByEmail.has(emailKey)) {
            await handleUpdate(existingCustomersByEmail.get(emailKey), row, name);
            return;
          }

          const created = await createCustomer(buildPayload(row));
          if (!created.success) {
            const isDuplicate = created.status === 422 && /already/i.test(created.message || '');
            if (isDuplicate) {
              const foundId = await findCustomerIdByEmail(row.email);
              if (foundId) {
                if (existingCustomersByEmail instanceof Map) existingCustomersByEmail.set(emailKey, foundId);
                log(`Row ${row._lineNumber} (${name}) already exists (stale cache) — updating ID ${foundId} instead.`);
                await handleUpdate(foundId, row, name);
                return;
              }
            }
            log(`FAILED row ${row._lineNumber} (${name}) → ${created.status}: ${created.message}`);
            results.failed.push({ row: row._lineNumber, name, error: created.message });
            return;
          }

          let note = '';
          if (row.affiliation_type_id) {
            const attach = await attachAffiliation(created.id, parseInt(row.affiliation_type_id, 10));
            if (!attach.success) note = `player type not set: ${attach.message}`;
          }
          log(`CREATED row ${row._lineNumber} (${name}) → ID: ${created.id}${note ? ' — ' + note : ''}`);
          results.created.push({ row: row._lineNumber, name, id: created.id, ref: created.ref, note });
        }));

        if (i + BATCH_SIZE < validRows.length) await dom.sleep(BATCH_DELAY_MS);
      }
    } catch (err) {
      modal.setStatus('❌ Error: ' + err.message, 'error');
      console.error('[CG Import] Error:', err);
      this.disabled = false;
      return;
    }

    modal.setProgress(100);
    modal.setStatus(
      `Done — ${results.created.length} created, ${results.updated.length} updated, ${results.skipped.length} skipped, ${results.failed.length} failed.`,
      results.failed.length > 0 ? 'error' : 'success'
    );
    log(`Import complete. Created: ${results.created.length}, Updated: ${results.updated.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);

    // Results CSV + table
    const allResultRows = [
      ...results.created.map(r => ({ row: r.row, name: r.name, id: r.id, ref: r.ref, status: r.note ? 'Created ⚠' : 'Created', error: r.note || '' })),
      ...results.updated.map(r => ({ row: r.row, name: r.name, id: r.id, ref: '', status: r.note ? 'Updated ⚠' : 'Updated', error: r.note || '' })),
      ...results.skipped.map(r => ({ row: r.row, name: r.name, id: '', ref: '', status: 'Skipped', error: r.reason })),
      ...results.failed.map(r =>  ({ row: r.row, name: r.name, id: '', ref: '', status: 'Failed',  error: r.error })),
    ].sort((a, b) => a.row - b.row);

    const RESULT_COLS = [
      { header: 'Row',    value: r => String(r.row) },
      { header: 'Name',   value: r => r.name },
      { header: 'Status', value: r => r.status },
      { header: 'ID',     value: r => r.id || '' },
      { header: 'Ref',    value: r => r.ref || '' },
      { header: 'Error',  value: r => r.error || '' },
    ];
    const fname = 'import_results_' + new Date().toISOString().slice(0, 10) + '.csv';
    const dlBtn = download.csvButton({ csv: csv.toCSV(allResultRows, RESULT_COLS), filename: fname });

    const statusStyle = s => s.startsWith('Created') ? 'color:#16a34a;font-weight:600;' : s.startsWith('Updated') ? 'color:#2563eb;font-weight:600;' : s === 'Failed' ? 'color:#dc2626;font-weight:600;' : 'color:#92400e;font-weight:600;';
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

    dlBtn.style.cssText += 'display:block;text-align:center;margin-bottom:14px;';
    const result = document.createElement('div');
    result.appendChild(dlBtn);
    result.insertAdjacentHTML('beforeend',
      `<div style="font-size:12px;font-weight:700;color:#262b2f;margin-bottom:4px;">Import Results</div>${tbl}`
    );
    modal.showResult(result);

    this.disabled = false;
  };

})();
