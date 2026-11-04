# Adding a New Tool

This walkthrough shows how to add a new integration to the extension. A tool that needs its own full page instead of a modal goes in its own folder and is listed in `PAGES` in `popup.js` (see `orders/`).

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

## 2. Register in `popup.js`

Add one entry to the `TOOLS` array:

```js
{
  match: url => url.includes('app.myplatform.com'),
  label: 'My Report',
  color: 'btn-blue',        // existing classes: btn-blue btn-green btn-purple btn-orange btn-teal
  files: ['content/myplatform.js'],
},
```

`CORE_FILES` is already included — you don't need to add anything else.

## 3. Update `manifest.json`

Add the platform's hostname to `host_permissions`:

```json
"https://app.myplatform.com/*"
```

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
