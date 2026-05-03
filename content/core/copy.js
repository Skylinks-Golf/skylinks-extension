(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const theme = ns.theme;

  function tableButton({ html, label = '📋  Copy Table to Clipboard' }) {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `border:1.5px solid ${theme.color.border};background:transparent;padding:8px 16px;border-radius:${theme.radius.input};cursor:pointer;font-size:0.875rem;`;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
        })]);
        btn.innerHTML = '✅  Copied!';
        setTimeout(() => { btn.textContent = label; }, 2000);
      } catch (err) {
        btn.innerHTML = '❌  Copy failed';
        console.error(err);
      }
    });
    return btn;
  }

  ns.copy = { tableButton };
})();
