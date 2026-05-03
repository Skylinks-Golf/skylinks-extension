(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const $ = id => document.getElementById(id);
  const css = (idOrEl, prop, val) => {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (el) el.style[prop] = val;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const toArr = v => v == null ? [] : (Array.isArray(v) ? v : [v]);
  ns.dom = { $, css, sleep, toArr };
})();
