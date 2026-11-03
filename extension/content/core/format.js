(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};

  ns.format = {
    money: n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    num:   n => Number(n || 0).toLocaleString('en-US'),
    pct:   n => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%',
  };
})();
