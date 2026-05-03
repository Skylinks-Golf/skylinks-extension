# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Chrome Extension (Manifest v3)** for Skylinks Golf Club. It injects content scripts into specific business platforms to add reporting and data import features via modal overlays.

**No build system.** There is no package.json, bundler, TypeScript, or npm. All files are vanilla ES2015+ JavaScript served directly to Chrome. To develop: load the extension in Chrome via `chrome://extensions` → "Load unpacked" → select this directory. Reload after each change.

## Architecture

### Routing: `popup.js` → content scripts
`popup.js` filters the active tab URL against a `TOOLS` registry (one entry per integration) and calls `chrome.scripting.executeScript()` to inject `CORE_FILES` plus the matching content script. Each content script is self-contained and runs on the page the user is already on.

Adding a 7th tool requires one new entry in `TOOLS` and a new `content/<platform>.js`. See `docs/adding_a_new_tool.md`.

### Content script pattern
Each integration lives in `content/<platform>.js` and follows this structure:
1. Wrapped in a named IIFE (e.g., `(function MerchantOsUI() { ... })()`) to avoid global scope pollution.
2. Calls `SkylinksUtils.createModal(...)` to mount a fixed-position overlay.
3. Fetches data via `SkylinksUtils.apiClient(...)` (passes through the user's existing browser session).
4. Transforms data and generates a CSV download or renders a Chart.js visualization.
5. Modal is wired to `SkylinksUtils.runReport(...)` for the standard validate→fetch→process→render pipeline. Tools with non-standard flows (Chronogolf import, SelectPi snapshot) orchestrate the button handler directly.

### Shared utilities: `content/utils.js`
Exposes the base `window.SkylinksUtils` object with:
- `escHtml(str)` — HTML entity escaping
- `escCsv(val)` — CSV value escaping (handles quotes, commas, newlines)
- `makeLogger(prefix)` — Returns a console logger with a consistent prefix
- `TD`, `TH` — CSS string constants for table cell styles (standard density)

### Shared core layer: `content/core/`
Each file extends `window.SkylinksUtils` with a sub-namespace. Load order matches the `CORE_FILES` array in `popup.js`.

| File | Namespace | Provides |
|------|-----------|---------|
| `theme.js` | `ns.theme` | Color tokens, font stacks, shadow, radius, z-index |
| `dom.js` | `ns.dom` | `$`, `css`, `sleep`, `toArr` |
| `dates.js` | `ns.dates` | `todayLocal`, `weekRangeMonSun`, `addDays`, `pacificMidnightUTC`, `pacificDayUTCWindow`, `formatLongDate`, `formatShortDate` |
| `api.js` | `ns.apiClient` | Fetch wrapper with cookie / bearer / csrf auth strategies, retry |
| `paginate.js` | `ns.paginate` | Offset-style (known total, parallel) and hasMore-style (sequential) pagination |
| `csv.js` | `ns.csv` | `toCSV`, `toSection`, `joinSections`, `toAutoSection`, `parseCSV` |
| `download.js` | `ns.download` | `csvButton` — branded download anchor with blob lifecycle |
| `copy.js` | `ns.copy` | `tableButton` — clipboard write for HTML tables |
| `table.js` | `ns.table` | `render` — column-spec → HTMLTableElement |
| `modal.js` | `ns.createModal` | Full overlay: title, fields (or custom body), status, progress, result, run button |
| `workflow.js` | `ns.runReport` | Wires modal to validate→fetch→process→render pipeline |

### Platform integrations

| File | Platform | Auth method | API type |
|------|----------|-------------|----------|
| `content/merchantos.js` | Lightspeed Retail | Session cookie | REST (JSON) |
| `content/chronogolf.js` | Lightspeed Golf | Session cookie + CSRF | REST JSON |
| `content/selectpi.js` | SelectPi | Bearer token from localStorage | REST JSON |
| `content/snapshot_selectpi.js` | SelectPi | Bearer token from localStorage | REST JSON + Chart.js |
| `content/perfectvenue.js` | Perfect Venue | Session cookie | GraphQL |
| `content/deputy.js` | Deputy | Session cookie | REST JSON |

## Key Non-Obvious Patterns

### Timezone handling
`dates.pacificMidnightUTC(dateStr)` uses Intl to detect the Pacific UTC offset at noon on the given date — correct year-round including the day DST flips. Do **not** use the candidate-probe approach (`for (const hour of ['07','08'])`) from the old `perfectvenue.js` — it is fragile on DST boundary days.

### Lightspeed pagination
`apiClient` + `paginate` handle batching. Pass `getTotal` (offset-style) with `parallel: true` for Lightspeed endpoints. See `merchantos.js` for the pattern.

### Chronogolf CSRF
`chronogolf.js` reads the CSRF token from the Angular injector first (`angular.element(document.body).injector()...`), falling back to cookie. This is passed as `{ csrf: getCsrfToken }` to `apiClient`. The `createCustomer` call additionally sends `X-XSRF-TOKEN` via `api.raw` since Chronogolf requires both headers on POST.

### Chronogolf club ID resolution
`chronogolf.js` reads the club ID from Angular's app state in `localStorage` first, falling back to parsing the URL hash. This works around a race condition where the Angular app may not have initialized yet.

### Chronogolf customer import rate limiting
Imports use `BATCH_SIZE = 3` with `BATCH_DELAY_MS = 500` between batches to avoid hitting API rate limits. Adjust cautiously.

### Chart.js instance management
`snapshot_selectpi.js` tracks active chart instances in `state.charts` and calls `.destroy()` before re-rendering. Skipping this causes canvas reuse errors. `createModal`'s `onClose` callback triggers `destroyCharts()` so cleanup also runs on ESC/overlay dismiss.

### SelectPi auth token
SelectPi scripts extract the Bearer token via `localStorage.getItem('token')` and validate it is present before showing any UI. With `apiClient({ auth: { bearerFromLocalStorage: 'token' } })`, the header is re-read on every request (handles session refresh without reinitializing the client).

### Deputy OU groups
`deputy.js` defines `OU_GROUPS` — a single table that consolidates `PROSHOP_OU_IDS`, `ADMIN_OU_IDS`, and `OU_FALLBACK_NAMES` into one structure. If new operational units are added in Deputy, add them here.

## Docs

`/docs/` contains API reference documentation, examples, and developer guides:
- `docs/adding_a_new_tool.md` — boilerplate for adding a 7th integration
- `docs/api_refs/lightspeed_api_ref.md`
- `docs/api_refs/selectpi_api_ref.md`
- `docs/deputy.md`
- `docs/perfect_venue.md`
