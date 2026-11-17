const logEvent = (...a) => window.SkylinksUtils.logEvent && window.SkylinksUtils.logEvent(...a);

// Tools come from the module registry (modules/registry.js + modules/<id>/module.js).
const Mods = window.SkylinksModules;

// Load each enabled module's descriptor, in order. A module that fails to load is logged
// and skipped so one bad module can't blank the popup.
function loadModules() {
  return Promise.all(Mods.enabled.map(id => new Promise(resolve => {
    const s = document.createElement('script');
    s.src = `modules/${id}/module.js`;
    s.onload = resolve;
    s.onerror = () => { logEvent('error', 'popup', `module failed to load: ${id}`); resolve(); };
    document.head.appendChild(s);
  })));
}

// Extension pages (not content scripts). Shown on every site, under the module's name.
function addPages(body, modules) {
  modules.filter(m => (m.pages || []).length).forEach(m => {
    const h = document.createElement('div');
    h.className = 'section';
    h.textContent = m.name;
    body.appendChild(h);
    m.pages.forEach(p => {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = p.label;
      btn.onclick = () => { chrome.tabs.create({ url: chrome.runtime.getURL(p.page) }); window.close(); };
      body.appendChild(btn);
    });
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

chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
  const body = document.getElementById('body');
  const url = tab.url || '';

  await loadModules();
  // Registration order is popup order: modules in index order, tools in descriptor order.
  const modules = Mods.enabled.map(id => Mods.list.find(m => m.id === id)).filter(Boolean);
  const matchingTools = [];
  modules.filter(m => Mods.matches(m, url)).forEach(m => (m.tools || []).forEach(t => matchingTools.push(t)));

  if (matchingTools.length > 0) {
    matchingTools.forEach(tool => {
      const btn = document.createElement('button');
      btn.className = `btn ${tool.color}`;
      btn.textContent = tool.label;
      btn.onclick = () => {
        const host = (() => { try { return new URL(url).hostname; } catch (_) { return ''; } })();
        logEvent('info', 'popup', `start: ${tool.label}`, { host });
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [...Mods.coreFiles, ...tool.files] })
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
    const names = modules.filter(m => (m.tools || []).length).map(m => m.name);
    const msg = document.createElement('div');
    msg.className = 'error';
    msg.textContent = `Navigate to ${names.length > 1 ? names.slice(0, -1).join(', ') + ', or ' + names[names.length - 1] : names[0] || 'a supported site'} to use these tools.`;
    body.appendChild(msg);
  }

  addPages(body, modules);
  addDiagnostics(body, url);

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Skylinks Golf Club';
  body.appendChild(hint);
});
