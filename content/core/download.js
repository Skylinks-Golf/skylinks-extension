(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const theme = ns.theme;

  // bom: prepend a UTF-8 byte-order mark so Excel opens accented names correctly.
  function csvButton({ csv, filename, label, bom = false }) {
    const displayLabel = label || filename;
    const blobUrl = URL.createObjectURL(new Blob([bom ? '\uFEFF' + csv : csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.textContent = displayLabel;
    a.href = blobUrl;
    a.download = filename;
    a.style.cssText = `background:${theme.color.brand};color:${theme.color.brandText};padding:9px 18px;border-radius:${theme.radius.pill};font-weight:700;text-decoration:none;display:inline-block;cursor:pointer;font-size:0.9rem;`;
    a.addEventListener('click', () => setTimeout(() => URL.revokeObjectURL(blobUrl), 10000));
    a.dispose = () => URL.revokeObjectURL(blobUrl);
    return a;
  }

  ns.download = { csvButton };
})();
