const CORE_FILES = [
  'content/utils.js',
  'content/core/theme.js',
  'content/core/dom.js',
  'content/core/dates.js',
  'content/core/errors.js',
  'content/core/api.js',
  'content/core/paginate.js',
  'content/core/csv.js',
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
  { match: url => url.includes('chronogolf.ca') || url.includes('chronogolf.com'), label: 'Import Customers', color: 'btn-green', files: ['content/chronogolf.js'] },
  { match: url => url.includes('chronogolf.ca') || url.includes('chronogolf.com'), label: 'Export Tee Sheet', color: 'btn-teal', files: ['content/tee_sheet_export.js'] },
  { match: url => url.includes('portal.getselectpi.com'), label: 'Daily Snapshot Report', color: 'btn-purple', files: ['content/vendor/chart.umd.min.js', 'content/snapshot_selectpi.js'] },
  { match: url => url.includes('portal.getselectpi.com'), label: 'Weekly Earnings Report', color: 'btn-purple', files: ['content/selectpi.js'] },
  { match: url => url.includes('app.perfectvenue.com'), label: 'Weekly Analytics Report', color: 'btn-orange', files: ['content/perfectvenue.js'] },
  { match: url => url.includes('348a3926020407.na.deputy.com'), label: 'Weekly Hours Report', color: 'btn-teal', files: ['content/deputy.js'] },
];

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
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [...CORE_FILES, ...tool.files] });
        window.close();
      };
      body.appendChild(btn);
    });
  } else {
    const msg = document.createElement('div');
    msg.className = 'error';
    msg.textContent = 'Navigate to Lightspeed Retail, Lightspeed Golf, the SelectPi Portal, Perfect Venue, or Deputy to use these tools.';
    body.appendChild(msg);
  }

  const hint = document.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'Skylinks Golf Club';
  body.appendChild(hint);
});
