SkylinksModules.register({
  id: 'selectpi',
  name: 'SelectPi',
  owner: 'Ian',
  hosts: ['portal.getselectpi.com'],
  tools: [
    { label: 'Daily Snapshot Report', color: 'btn-purple', files: ['content/vendor/chart.umd.min.js', 'content/snapshot_selectpi.js'] },
    { label: 'Weekly Earnings Report', color: 'btn-purple', files: ['content/selectpi.js'] },
  ],
});
