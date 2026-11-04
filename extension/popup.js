const logEvent = (...a) => window.SkylinksUtils.logEvent && window.SkylinksUtils.logEvent(...a);

const CORE_FILES = [
  'content/utils.js',
  'content/core/log.js',
  'content/core/theme.js',
  'content/core/config.js',
  'content/core/dom.js',
  'content/core/dates.js',
  'content/core/errors.js',
  'content/core/api.js',
  'content/core/paginate.js',
  'content/core/csv.js',
  'content/core/format.js',
  'content/core/download.js',
  'content/core/copy.js',
  'content/core/table.js',
  'content/core/modal.js',
  'content/core/workflow.js',
  'content/core/preflight.js',
];

const TOOLS = [
  { match: url => url.includes('us.merchantos.com'), label: 'Daily Snapshot Report', color: 'btn-blue', files: ['content/vendor/chart.umd.min.js', 'content/snapshot_merchantos.js'] },
  { match: url => url.includes('us.merchantos.com'), label: 'Sales Lines Report', color: 'btn-blue', files: ['content/merchantos.js'] },
  { match: url => url.includes('us.merchantos.com'), label: 'Sync Customer Type', color: 'btn-green', files: ['content/merchantos_customer_type_sync.js'] },
  { match: url => url.includes('chronogolf.ca') || url.includes('chronogolf.com'), label: 'Import Customers', color: 'btn-green', files: ['content/chronogolf.js'] },
  { match: url => url.includes('chronogolf.ca') || url.includes('chronogolf.com'), label: 'Export Tee Sheet', color: 'btn-teal', files: ['content/tee_sheet_export.js'] },
  { match: url => url.includes('portal.getselectpi.com'), label: 'Daily Snapshot Report', color: 'btn-purple', files: ['content/vendor/chart.umd.min.js', 'content/snapshot_selectpi.js'] },
  { match: url => url.includes('portal.getselectpi.com'), label: 'Weekly Earnings Report', color: 'btn-purple', files: ['content/selectpi.js'] },
  { match: url => url.includes('app.perfectvenue.com'), label: 'Weekly Analytics Report', color: 'btn-orange', files: ['content/perfectvenue.js'] },
  { match: url => url.includes('348a3926020407.na.deputy.com'), label: 'Weekly Hours Report', color: 'btn-teal', files: ['content/deputy.js'] },
  { match: url => url.includes('dashboard.stripe.com'), label: 'Save Stripe Report', color: 'btn-blue', files: ['content/stripe.js'] },
];

// Extension pages (not content scripts). Shown on every site; each opens orders/app.html#<tab>.
const PAGES = [
  { label: "Last Week's Sales", page: 'orders/app.html#sales' },
  { label: 'Money (Profit & Leaks)', page: 'orders/app.html#money' },
  { label: 'Add / Cut / Swap Ideas', page: 'orders/app.html#ideas' },
  { label: "This Week's Order", page: 'orders/app.html#order' },
];

function addPages(body) {
  const h = document.createElement('div');
  h.className = 'section';
  h.textContent = 'Pro Shop Orders';
  body.appendChild(h);
  PAGES.forEach(p => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = p.label;
    btn.onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL(p.page) }); window.close(); };
    body.appendChild(btn);
  });
}

// Diagnostics: lets staff copy the stored log to send to Ian (or paste to Claude).
function addDiagnostics(body, tabUrl) {
  const D = window.SkylinksUtils.diag;
  const h = document.createElement('div');
  h.className = 'section';
  h.textContent = 'Diagnostics';
  body.appendChild(h);

  const info = document.createElement('p');
  info.className = 'hint';
  info.style.textAlign = 'left';
  body.appendChild(info);

  const row = document.createElement('div');
  row.className = 'diag';
  body.appendChild(row);

  const refresh = async () => {
    const entries = await D.getEntries();
    const lastErr = [...entries].reverse().find(e => e.lvl === 'error');
    info.textContent = `${entries.length} log entries` + (lastErr ? ` · last error: ${lastErr.msg}` : ' · no errors recorded');
    return entries;
  };
  const tabHost = () => { try { return new URL(tabUrl).hostname; } catch (_) { return ''; } };

  const mk = (label, fn) => {
    const b = document.createElement('button');
    b.className = 'btn-sm';
    b.textContent = label;
    b.onclick = async () => {
      try { await fn(b); } catch (err) { logEvent('error', 'popup', `diagnostics ${label} failed`, err); }
    };
    row.appendChild(b);
  };
  mk('Copy log', async b => {
    const text = D.formatLog(await D.getEntries(), { tab: tabHost() });
    await navigator.clipboard.writeText(text);
    b.textContent = 'Copied';
    setTimeout(() => { b.textContent = 'Copy log'; }, 1500);
  });
  mk('Download', async () => {
    const text = D.formatLog(await D.getEntries(), { tab: tabHost() });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'skylinks-tools-log.txt';
    a.click();
  });
  mk('Clear', async () => { await D.clear(); await refresh(); });

  refresh();
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  const body = document.getElementById('body');
  const url = tab.url || '';

  const matchingTools = TOOLS.filter(tool => tool.match(url));
  if (matchingTools.length > 0) {
    matchingTools.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = `btn ${tool.color}`;
      btn.textContent = tool.label;
      btn.onclick = () => {
        const host = (() => { try { return new URL(url).hostname; } catch (_) { return ''; } })();
        logEvent('info', 'popup', `start: ${tool.label}`, { host });
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [...CORE_FILES, ...tool.files] })
          .then(() => window.close())
          .catch(err => {
            logEvent('error', 'popup', `could not start: ${tool.label}`, err);
            const msg = document.createElement('div');
            msg.className = 'error';
            msg.textContent = `Could not start "${tool.label}". Reload the page and try again. If it keeps happening, use Copy log below and send it to Ian.`;
            body.insertBefore(msg, body.firstChild);
          });
      };
      body.appendChild(btn);
    });
  } else {
    const msg = document.createElement('div');
    msg.className = 'error';
    msg.textContent = 'Navigate to Lightspeed Retail, Lightspeed Golf, the SelectPi Portal, Perfect Venue, Deputy, or Stripe to use these tools.';
    body.appendChild(msg);
  }

  addPages(body);
  addDiagnostics(body, url);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Skylinks Golf Club';
  body.appendChild(hint);
});
