SkylinksModules.register({
  id: 'perfectvenue',
  name: 'Perfect Venue',
  owner: 'Ian',
  hosts: ['app.perfectvenue.com'],
  extraHosts: ['api.perfectvenue.com'],  // used by the tool but has no buttons of its own
  tools: [
    { label: 'Weekly Analytics Report', color: 'btn-orange', files: ['content/perfectvenue.js'] },
  ],
});
