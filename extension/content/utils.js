window.SkylinksUtils = (() => {
    const TD = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;';
    const TH = 'padding:10px 12px;border:none;border-bottom:1px solid #d1d5db;font-size:12px;font-weight:700;color:#262b2f;';

    const escHtml = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const escCsv = v => {
        const s = String(v ?? '');
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? '"' + s.replace(/"/g, '""') + '"'
            : s;
    };

    // Delegates to core/log.js (console + stored diagnostic log) once it is loaded.
    const makeLogger = prefix => window.SkylinksUtils.createLogger
        ? window.SkylinksUtils.createLogger(prefix)
        : (msg, ...args) => console.log(`[${prefix}] ${msg}`, ...args);

    return { TD, TH, escHtml, escCsv, makeLogger };
})();
