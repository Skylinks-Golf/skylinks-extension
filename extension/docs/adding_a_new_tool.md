# Adding a New Tool

This walkthrough shows how to add a new integration to the extension. A tool that needs its own full page instead of a modal uses the `pages` field of its module (see `modules/orders/` and `orders/`).

## 1. Create the content script

Create `content/<platform>.js`. Use this boilerplate:

```js
(function MyPlatformReportUI() {

  const { makeLogger, createModal, apiClient, csv, download, runReport, dates } = window.SkylinksUtils;
  const log = makeLogger('MyPlatform Report');

  // Tool-specific constants stay here — do NOT push them into core/.
  const BASE_URL = 'https://api.myplatform.com';

  const api = apiClient({
    baseUrl: BASE_URL,
    auth: 'cookie',          // or { bearerFromLocalStorage: 'token' }, { bearer: '...' }, { csrf: fn }
  });

  const modal = createModal({
    id: 'mp',                // unique per tool — used for DOM ids like 'mp-overlay'
    title: 'My Report',
    emoji: '📋',
    description: 'Fetches … and downloads a CSV.',
    fields: [
      { id: 'start', type: 'date', label: 'Week Start (Monday)', value: dates.weekRangeMonSun().monday },
      { id: 'end',   type: 'date', label: 'Week End (Sunday)',   value: dates.weekRangeMonSun().sunday },
    ],
    runLabel: 'Generate Report',
  });

  runReport({
    modal,
    validate: ({ start, end }) => {
      if (!start || !end) return 'Please select both dates.';
      if (start > end) return 'Start must be before end.';
    },

    fetch: async ({ start, end }, ctx) => {
      ctx.setStatus('Fetching data…');
      const data = await api.get(`/reports?start=${start}&end=${end}`);
      ctx.setProgress(70);
      return data;
    },

    process: (raw, values) => {
      // Transform raw → rows
      return raw.items.map(item => ({ /* ... */ }));
    },

    render: (rows, values, modal) => {
      const COLS = [
        { header: 'Date',   value: r => dates.formatShortDate(r.date) },
        { header: 'Amount', value: r => '$' + r.amount.toFixed(2), align: 'right' },
      ];
      const fname = `myplatform_${values.start}_to_${values.end}.csv`;
      modal.setProgress(100);
      modal.setStatus(`✅ ${rows.length} rows exported.`, 'success');

      const dlBtn = download.csvButton({ csv: csv.toCSV(rows, COLS), filename: fname });
      const result = document.createElement('div');
      result.appendChild(dlBtn);
      modal.showResult(result);
    },
  });

})();
```

## 2. Describe it as a module

Every tool belongs to a **module**: a folder under `modules/<id>/` with a `module.js` descriptor. The popup is built from these descriptors, so you never edit `popup.js`.

1. Copy `modules/_template/` to `modules/<id>/` (lowercase letters, digits and dashes).
2. Fill in `module.js`:

```js
SkylinksModules.register({
  id: 'myplatform',               // same as the folder name
  name: 'My Platform',            // shown in the popup's "navigate to..." message
  owner: 'LC',                    // who to ask about this module
  hosts: ['app.myplatform.com'],  // the sites the tool buttons appear on; subdomains match too
  // extraHosts: ['api.myplatform.com'],  // optional: other sites this module's code talks to or opens (no buttons there)
  tools: [
    { label: 'My Report', color: 'btn-blue', files: ['modules/myplatform/report.js'] },
  ],
  // pages: [{ label: 'My Page', page: 'modules/myplatform/app.html' }],  // optional full pages, shown on every site
});
```

3. Put the tool's content script (step 1) in the same folder, e.g. `modules/myplatform/report.js`. Existing tools still live in `content/`; that's fine, point `files` at wherever the file is.
4. Add the id to the list in `modules/index.js` (one line). A folder that isn't listed never loads, and the repo check flags it. Prefix a draft folder with `_` to keep it out of the check.

The shared `content/core/` files are injected before your files automatically. Chart.js is at `content/vendor/chart.umd.min.js` if you need it; list it first in `files`.

`extraHosts` is for sites your module reaches without showing buttons there, such as an API domain or a vendor portal a page fills. Every host in `hosts` or `extraHosts` needs a manifest entry (step 3), and every manifest host must be claimed by some module, which is what makes removing a module clean.

A module with `pages` and no `tools` is an extension page module (see `modules/orders/`). Its buttons show on every site under the module's name.

## 3. Add the permission to `manifest.json` and list it as pending

Add each host your module needs to `host_permissions`:

```json
"https://app.myplatform.com/*"
```

Then list each new host or permission under `pending` in `scripts/approved-permissions.json`, with your module and why you need it:

```json
"pending": [
  { "type": "host_permissions", "value": "https://app.myplatform.com/*", "module": "myplatform", "reason": "Reads the weekly report" }
]
```

You don't need Ian's OK to keep building. Ian approves at the merge to `main`: the repo check passes on your branch pushes, but fails on the pull request until Ian moves each entry from `pending` into the approved lists (or removes it to refuse). Only Ian clears `pending`. If your agent can't tell whether something is a permission, list it anyway.

`node scripts/check-repo.js` fails if a module host has no matching entry, if a listed file is missing, if an id is duplicated, or if a color isn't one the popup styles.

## Removing or pausing a module

Modules are self-contained, so taking one out is three steps:

1. Delete the module's line from `modules/index.js`, then delete its folder `modules/<id>/`. If its code lives in `content/`, delete those files too.
2. Run `node scripts/check-repo.js`. It lists every manifest host the module was the only user of. Remove those lines from `host_permissions` in `manifest.json`.
3. Tell Ian, so he can drop them from `scripts/approved-permissions.json` (extra entries there are harmless, just untidy). Bump the version and add a changelog line.

**To pause instead of delete**, remove the line from `modules/index.js` and rename the folder with a leading underscore (`modules/_myplatform/`). The popup ignores it and the check skips the folder, but its hosts will still be flagged as unused, so remove those from the manifest too and put them back when you re-enable it.

## Bringing in a tool that was built somewhere else

If you built a tool on its own (a standalone page, script or Artifact) and want it in the extension, ask your Claude agent to do the move and give it these facts:

- **What it does and who uses it**, and which sites it reads from or changes.
- **How it gets its data today.** Inside the extension it reads through the staff member's signed-in session, so there are no stored passwords or keys. If the standalone version uses a key or token, say so before anything is copied. Never paste it into the chat or the repo.
- **Which kind it is:** buttons on a vendor site (a content script, steps 1-3 above) or a full page of its own (`pages`, like `modules/orders/`).

The agent then creates `modules/<id>/`, moves the code in, swaps hand-rolled modals, CSV, dates and API calls for the shared `content/core/` helpers, and registers it. Hosts need Ian's approval first (step 3). Keep real data out of the folder: sample data is made up.

## 4. Finish up

- **Logging:** use `const log = makeLogger('Name')`, and `log.error('what failed', err)` in catch blocks. Log steps, row numbers and counts, never names, contact details, card data, tokens or raw API responses. The log gets sent to Ian and pasted into Claude.
- **Release:** bump `version` in `manifest.json` and add a line to `CHANGELOG.md`.
- **Check:** run `node scripts/check-repo.js` from the repo root, then load unpacked and try the tool. See `PROTOCOLS.md` section 5.

## Core API reference

| Utility | Import | What it does |
|---------|--------|-------------|
| `createModal` | `ns.createModal` | Modal overlay with title, fields, status, progress, result area |
| `apiClient` | `ns.apiClient` | Fetch wrapper with auth strategies, retry, error handling |
| `paginate` | `ns.paginate` | Offset or hasMore-style pagination |
| `csv.toCSV` | `ns.csv.toCSV` | Column-spec → CSV string |
| `csv.toAutoSection` | `ns.csv.toAutoSection` | Model array → titled CSV section |
| `download.csvButton` | `ns.download.csvButton` | Branded download anchor with blob lifecycle |
| `copy.tableButton` | `ns.copy.tableButton` | Clipboard write button for HTML tables |
| `table.render` | `ns.table.render` | Column-spec → HTMLTableElement |
| `dates.weekRangeMonSun` | `ns.dates.weekRangeMonSun` | Current week Mon–Sun as `{ monday, sunday }` |
| `dates.pacificDayUTCWindow` | `ns.dates.pacificDayUTCWindow` | UTC window for a Pacific calendar day (Lightspeed) |
| `runReport` | `ns.runReport` | Wires modal to a validate→fetch→process→render pipeline |

For tools with richer UI (file dropzone, custom charts), pass `body: htmlString` to `createModal` instead of `fields`, and orchestrate the flow manually instead of using `runReport`.
