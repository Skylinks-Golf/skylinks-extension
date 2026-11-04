(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  // Diagnostic log. Entries are kept in chrome.storage.local (a ring buffer) so
  // they survive the popup closing and can be copied from the popup's
  // Diagnostics section. Logging must never break a tool, so nothing here throws.
  //
  // PRIVACY: log what happened (tool, step, counts, status codes), never the
  // data itself. Everything is also run through sanitize()/redact() as a
  // safety net, but do not pass customer records, card data or tokens in.

  const KEY = 'skylinks.log';
  const MAX_ENTRIES = 500;
  const MAX_STR = 300;
  const MAX_ITEMS = 10;
  const SENSITIVE_KEY = /pass|token|secret|auth|cookie|card|cvv|email|phone|first.?name|last.?name|customer|address|birth|ghin|ssn/i;

  const store = () => (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) || null;

  function redact(s) {
    return String(s)
      .replace(/https?:\/\/[^\s"')]+/g, u => u.split('?')[0])
      .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
      .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
      .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '[token]')
      .replace(/\b\d(?:[ -]?\d){7,}\b/g, '[num]')
      .slice(0, MAX_STR);
  }

  function sanitize(v, depth = 0) {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
    if (typeof v === 'string') return redact(v);
    if (v instanceof Error) {
      return {
        name: v.name,
        message: redact(v.message),
        code: v.code,
        status: v.status,
        detail: v.detail ? redact(v.detail) : undefined,
        stack: v.stack ? redact(String(v.stack).split('\n').slice(0, 6).join(' | ')) : undefined,
      };
    }
    if (depth >= 2) return '[object]';
    if (Array.isArray(v)) return v.slice(0, MAX_ITEMS).map(x => sanitize(x, depth + 1));
    if (typeof v === 'object') {
      const out = {};
      Object.keys(v).slice(0, MAX_ITEMS).forEach(k => {
        out[k] = SENSITIVE_KEY.test(k) ? '[omitted]' : sanitize(v[k], depth + 1);
      });
      return out;
    }
    return String(typeof v);
  }

  let chain = Promise.resolve();
  function persist(entry) {
    const s = store();
    if (!s) return;
    chain = chain.then(async () => {
      const got = await s.get(KEY);
      const arr = Array.isArray(got[KEY]) ? got[KEY] : [];
      arr.push(entry);
      if (arr.length > MAX_ENTRIES) arr.splice(0, arr.length - MAX_ENTRIES);
      await s.set({ [KEY]: arr });
    }).catch(() => {});
  }

  function where() {
    try { return location.protocol === 'chrome-extension:' ? 'extension' : location.hostname; } catch (_) { return ''; }
  }

  // level: 'info' | 'warn' | 'error'
  function logEvent(level, tool, msg, data) {
    try {
      const entry = { t: new Date().toISOString(), lvl: level, tool: String(tool), at: where(), msg: redact(msg) };
      if (data !== undefined) entry.data = sanitize(data);
      persist(entry);
    } catch (_) { /* never break the caller */ }
  }

  // Per-tool logger: log(msg, ...), log.warn(msg, ...), log.error(msg, errOrData).
  // Also writes to the console, as the old makeLogger did.
  function createLogger(prefix) {
    const emit = (level, consoleFn) => (msg, ...args) => {
      consoleFn(`[${prefix}] ${msg}`, ...args);
      logEvent(level, prefix, msg, args.length === 0 ? undefined : (args.length === 1 ? args[0] : args));
    };
    const log = emit('info', console.log.bind(console));
    log.warn = emit('warn', console.warn.bind(console));
    log.error = emit('error', console.error.bind(console));
    return log;
  }

  const pt = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'America/Los_Angeles' });

  async function getEntries() {
    const s = store();
    if (!s) return [];
    try { const got = await s.get(KEY); return Array.isArray(got[KEY]) ? got[KEY] : []; } catch (_) { return []; }
  }

  async function clear() {
    const s = store();
    chain = chain.then(() => (s ? s.remove(KEY) : null)).catch(() => {});
    return chain;
  }

  function formatLog(entries, extra = {}) {
    let version = '?';
    try { version = chrome.runtime.getManifest().version; } catch (_) {}
    const head = [
      'Skylinks Tools diagnostic log',
      `Extension version: ${version}`,
      `Browser: ${(typeof navigator !== 'undefined' && navigator.userAgent) || '?'}`,
      `Copied: ${pt(new Date().toISOString())} Pacific`,
      extra.tab ? `Active tab: ${extra.tab}` : null,
      `Entries: ${entries.length} (newest last)`,
      '',
    ].filter(x => x !== null);
    const lines = entries.map(e => {
      const d = e.data === undefined ? '' : ' ' + JSON.stringify(e.data);
      return `${pt(e.t)} ${String(e.lvl).toUpperCase().padEnd(5)} [${e.tool}] (${e.at || '-'}) ${e.msg}${d}`;
    });
    return head.concat(lines).join('\n');
  }

  // Extension pages (popup, orders) are not covered by the tool try/catch blocks,
  // so capture uncaught errors there. Not done in content scripts: those share
  // the vendor page's error stream and would log its noise.
  try {
    if (location.protocol === 'chrome-extension:' && !ns._diagHooked) {
      ns._diagHooked = true;
      window.addEventListener('error', e => logEvent('error', 'uncaught', e.message, { file: String(e.filename || '').split('/').pop(), line: e.lineno, col: e.colno }));
      window.addEventListener('unhandledrejection', e => logEvent('error', 'uncaught', 'Unhandled promise rejection', e.reason));
    }
  } catch (_) {}

  ns.logEvent = logEvent;
  ns.createLogger = createLogger;
  ns.diag = { getEntries, clear, formatLog, redact, sanitize };
})();
