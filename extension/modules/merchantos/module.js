SkylinksModules.register({
  id: 'merchantos',
  name: 'Lightspeed Retail',
  owner: 'Ian',
  hosts: ['us.merchantos.com'],
  tools: [
    { label: 'Daily Snapshot Report', color: 'btn-blue', files: ['content/vendor/chart.umd.min.js', 'content/snapshot_merchantos.js'] },
    { label: 'Sales Lines Report', color: 'btn-blue', files: ['content/merchantos.js'] },
    { label: 'Sync Customer Type', color: 'btn-green', files: ['content/merchantos_customer_type_sync.js'] },
  ],
});
