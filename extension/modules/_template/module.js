// Copy this folder to modules/<id>/, rename the id, fill it in, then add '<id>' to
// modules/index.js. This file is not loaded until you do that. See docs/adding_a_new_tool.md.
SkylinksModules.register({
  id: 'myplatform',               // lowercase letters, digits and dashes; same as the folder name
  name: 'My Platform',            // shown in the popup's "navigate to..." message
  owner: 'Ian',                   // who to ask about this module
  hosts: ['app.myplatform.com'],  // hostnames the tools run on (subdomains match too).
                                  // Each one also needs https://<host>/* in manifest.json host_permissions.
  tools: [                        // buttons shown when the active tab is on one of the hosts
    {
      label: 'My Report',
      color: 'btn-blue',          // btn-blue btn-green btn-purple btn-orange btn-teal
      files: ['modules/myplatform/report.js'],  // injected after the shared core files
    },
  ],
  // pages: [{ label: 'My Page', page: 'modules/myplatform/app.html' }],  // optional full pages, shown on every site
});
