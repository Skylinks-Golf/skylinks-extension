// Module registry. Every Skylinks tool belongs to a module: one folder under modules/<id>/
// with a module.js that calls SkylinksModules.register({...}). popup.js builds the whole
// popup from these descriptors, so adding a module never means editing popup.js.
// See docs/adding_a_new_tool.md for the descriptor fields and a copyable template.
window.SkylinksModules = (() => {
  // Shared files injected before every tool's own files (order matters).
  const coreFiles = [
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

  // Button colors the popup has CSS for.
  const colors = ['btn-blue', 'btn-green', 'btn-purple', 'btn-orange', 'btn-teal'];

  const list = [];

  function register(m) { list.push(m); }

  // Does this tab URL belong to the module? A host matches itself and its subdomains.
  function matches(m, url) {
    let host = '';
    try { host = new URL(url).hostname; } catch (_) { return false; }
    return (m.hosts || []).some(h => host === h || host.endsWith('.' + h));
  }

  return { coreFiles, colors, list, register, matches };
})();
