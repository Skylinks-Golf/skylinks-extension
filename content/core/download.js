(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const theme = ns.theme;

  function csvButton({ csv, filename, label }) {
    const displayLabel = label || filename;
    const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
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
