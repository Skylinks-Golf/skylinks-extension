# Refactor Plan — Reduce Duplication & Prep for Future Integrations

**Created:** 2026-05-02
**Audience:** Agents executing this plan in subsequent sessions. Each task is self-contained — read the **Context** and **Files** sections in this document plus `CLAUDE.md` before starting any task.

---

## 0. Repo Context (read this first)

- This is a **Chrome MV3 extension** for Skylinks Golf Club. Vanilla ES2015+ JavaScript, **no build system**, no npm, no TypeScript, no bundler.
- Files are loaded directly into the browser. `popup.js` injects `content/utils.js` plus the matching content script via `chrome.scripting.executeScript({ files: [...] })`. Whatever new shared files this plan creates must be added to those `files` arrays.
- Each integration content script is wrapped in a named IIFE and assumes `window.SkylinksUtils` is already loaded.
- Test by running `chrome://extensions` → "Load unpacked" → reload after each change → click the extension button on the relevant platform's page.
- Existing integrations and the platforms they touch are listed in `CLAUDE.md`. Do not change their observable behavior unless a task explicitly says to.

## Guiding principles

1. **Don't bulk-rewrite.** Build the shared layer first, then migrate one integration at a time, verifying each migration before moving on. Migrations are reversible per file.
2. **Match the third occurrence rule.** Only abstract things that are duplicated in 3+ places already. Tool-specific business rules (discount payment-method overrides, OU groupings, bucket-name remaps) **stay with their tool**.
3. **No new build tooling.** No npm, no bundler, no TypeScript. JSDoc `@typedef` is welcome; transpilation is not.
4. **Preserve all current behavior.** No feature changes, no UI redesigns, no copy edits. If you spot a bug, leave it for a separate task — note it at the bottom of this file under "Discovered issues" instead of fixing it inline.
5. **Keep IIFE + global-namespace style.** New shared modules expose themselves on `window.SkylinksUtils` (or a sub-namespace). Do not introduce ES module `import`/`export`.
6. **Verify visually.** Type-check passes are not sufficient. Each migrated tool must be loaded in Chrome and exercised end-to-end (run the report, download the CSV, dismiss the modal) before being marked complete.

## Repo layout (target)

```
content/
  core/              ← NEW shared layer
    theme.js
    dom.js
    dates.js
    api.js
    paginate.js
    csv.js
    download.js
    copy.js
    table.js
    modal.js
    workflow.js
  vendor/            ← unchanged (Chart.js UMD)
  utils.js           ← becomes a thin re-export shim, keeps API-compatible
  merchantos.js
  chronogolf.js
  selectpi.js
  snapshot_selectpi.js
  perfectvenue.js
  deputy.js
popup.js             ← refactored to a registry
```

All `core/*.js` files attach to `window.SkylinksUtils` (extending the existing object). Example pattern every core file should follow:

```js
(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  // ... build module exports as locals ...
  ns.theme = { /* ... */ };          // or ns.modal = createModal, etc.
})();
```

## Task dependency graph

```
T1 (utils dedup)  ─┐
T2 (theme + dom) ──┼──> T4 (modal) ──> T8 (workflow) ──> T10 (migrations)
T3 (dates)       ──┘                                ▲
T5 (api)  ──────────────> T6 (csv) ──> T7 (download/copy) ──> T8
T5 ──> paginate (part of T5)
                                       T9 (popup registry) ──> T10
```

Tasks T1–T9 build the shared layer. **Task T10** is the migration of each existing integration; it has 6 sub-tasks (one per content script) that can run in any order **after** T1–T9 are complete.

---

## Task T1 — Promote duplicated utilities back into `utils.js`

**Goal:** Eliminate redeclarations of `escHtml`, `escCsv`, and the `log` helper that already exist on `window.SkylinksUtils`.

**Why first:** Zero-risk cleanup. No new files, no API surface. Easiest agent work in the plan; do not skip it because it removes noise from later tasks.

**Files to edit:**
- `content/selectpi.js` — remove local `escHtml` (line 73), local `escCsv` (line 83), local `log` (line 74). Use destructured `window.SkylinksUtils` like `merchantos.js` already does.
- `content/perfectvenue.js` — remove local `escHtml` (line 113), local `escCsv` (line 128), local `log` (line 114).
- `content/deputy.js` — remove local `escHtml` (line 77), local `escCsv` (line 78), local `log` (line 79).
- `content/snapshot_selectpi.js` — already destructures from `SkylinksUtils`. Verify there are no stragglers; the local `TD`/`TH` redefinition inside `render()` (around line 384) is **intentional** for the snapshot's denser table style and stays.

**Pattern to apply** at the top of each file (replace whatever's there):
```js
const { escHtml, escCsv, makeLogger } = window.SkylinksUtils;
const log = makeLogger('SP Report');   // pick the right prefix per file
```

**Acceptance:**
- `grep -n "const escHtml" content/` returns matches **only** in `content/utils.js` (and any new core files).
- `grep -n "const escCsv" content/` returns matches **only** in `content/utils.js`.
- `grep -nE "const log =\s*\(msg" content/` returns no matches outside `core/`. (`makeLogger` is allowed.)
- Manual smoke test: load each touched tool in Chrome, run a report, confirm CSV output is byte-identical to before. (Diff the downloaded files.)

---

## Task T2 — Create `core/theme.js` and `core/dom.js`

**Goal:** Centralize the colors and DOM helpers that every script copy-pastes.

### T2a — `content/core/theme.js`

Export theme tokens as `window.SkylinksUtils.theme`:

```js
(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  ns.theme = {
    color: {
      brand:       '#eeb02b',
      brandText:   '#1c1b19',
      ink:         '#262b2f',
      muted:       '#475569',
      subtle:      '#94a3b8',
      success:     '#16a34a',
      successBg:   '#f0fdf4',
      error:       '#dc2626',
      errorBg:     '#fef2f2',
      warn:        '#d97706',
      warnText:    '#92400e',
      warnBg:      '#fffbeb',
      border:      '#d1d5db',
      borderSoft:  '#e2e8f0',
      cardBg:      '#fff',
      pageBg:      '#f8fafc',
      overlayBg:   'rgba(0,0,0,0.65)',
    },
    font: {
      ui:      '"Segoe UI",Tahoma,Geneva,Verdana,sans-serif',
      heading: "'Trebuchet MS','Segoe UI',Tahoma,sans-serif",
    },
    shadow: {
      card: '0 24px 64px rgba(0,0,0,0.35)',
    },
    radius: { card: '14px', input: '8px', pill: '99px' },
    z: { overlay: 999999 },
  };
})();
```

**Do not** try to convert all inline-style strings to use these tokens in this task. Tokens get adopted as files migrate in T10.

### T2b — `content/core/dom.js`

Export DOM helpers that almost every script redeclares:

```js
(function () {
  const ns = window.SkylinksUtils = window.SkylinksUtils || {};
  const $ = id => document.getElementById(id);
  const css = (idOrEl, prop, val) => {
    const el = typeof idOrEl === 'string' ? $(idOrEl) : idOrEl;
    if (el) el.style[prop] = val;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // toArr is widely useful; merchantos.js had it locally.
  const toArr = v => v == null ? [] : (Array.isArray(v) ? v : [v]);
  ns.dom = { $, css, sleep, toArr };
})();
```

**Files to edit:** none beyond creating the two new files. **Do not migrate callers in this task** — that happens during T10.

**Acceptance:**
- New files exist at `content/core/theme.js` and `content/core/dom.js`.
- Loading either file in a Chrome console (`chrome.scripting.executeScript({ target: …, files: ['content/utils.js', 'content/core/theme.js'] })`) leaves `window.SkylinksUtils.theme` populated and does not break existing tools.
- No file in `content/` is otherwise modified.

---

## Task T3 — Create `content/core/dates.js`

**Goal:** One home for date math currently duplicated across `selectpi.js`, `perfectvenue.js`, `deputy.js`, and `merchantos.js`.

**Functions to expose on `window.SkylinksUtils.dates`:**

| Name | Signature | Replaces |
|---|---|---|
| `todayLocal()` | `() => 'YYYY-MM-DD'` (local TZ, not UTC) | `snapshot_selectpi.js:46–47` hand-rolled `todayStr` |
| `weekRangeMonSun(reference?)` | `(Date \| 'YYYY-MM-DD' = today) => { monday: 'YYYY-MM-DD', sunday: 'YYYY-MM-DD' }` | `selectpi.js:13–19`, `perfectvenue.js:59–65`, `deputy.js:15–21` |
| `addDays(dateStr, n)` | `('YYYY-MM-DD', number) => 'YYYY-MM-DD'` | `perfectvenue.js:52–56` |
| `pacificMidnightUTC(dateStr)` | `('YYYY-MM-DD') => Date` (UTC instant of Pacific midnight) | `merchantos.js:94–104` |
| `pacificDayUTCWindow(dateStr)` | `('YYYY-MM-DD') => { start: ISOString, end: ISOString }` | `merchantos.js:106–113` |
| `formatLongDate(dateStr)` | `('YYYY-MM-DD') => 'Friday, May 2, 2026'` | `snapshot_selectpi.js:94–97` |
| `formatShortDate(dateStr)` | `('YYYY-MM-DD') => 'M/D/YYYY'` | `merchantos.js:270` |

**Implementation requirements:**
- `pacificMidnightUTC` must use the **Intl-based offset detection** approach from `merchantos.js:94–104`. Do **not** use the candidate-probe approach from `perfectvenue.js:43–50`. Reason: the Intl approach is correct year-round including the day DST flips; the probe relies on a hardcoded `['07','08']` set.
- `weekRangeMonSun` must accept either a `Date` instance or a `'YYYY-MM-DD'` string. If a string is passed, parse it with `new Date(s + 'T12:00:00')` (local noon) to avoid off-by-one drift on DST boundaries.
- All public functions must operate on `'YYYY-MM-DD'` strings as their canonical date type. `Date` instances are an internal detail.

**Acceptance:**
- File exists at `content/core/dates.js`.
- Unit-style sanity check: in Chrome DevTools after injecting the file, run:
  ```js
  SkylinksUtils.dates.weekRangeMonSun('2026-05-02')   // Saturday
  // → { monday: '2026-04-27', sunday: '2026-05-03' }
  SkylinksUtils.dates.addDays('2026-03-08', 1)         // PDT-DST start
  // → '2026-03-09'
  SkylinksUtils.dates.pacificDayUTCWindow('2026-05-02')
  // → { start: '2026-05-02T07:00:00.000Z', end: '2026-05-03T07:00:00.000Z' }
  ```

---

## Task T4 — Create `content/core/modal.js`

**Goal:** Replace the ~80–110 lines of overlay/card/header/progress/status/result/close-button boilerplate that every content script copies.

**API:** `SkylinksUtils.createModal(config) → ModalHandle`

**`config` shape:**
```js
{
  id:        'ls-dr',                  // unique prefix, becomes overlay id `${id}-overlay`
  title:     'Sales Lines Report',
  emoji:     '📊',
  description: 'Fetches all sale line items …',  // optional <p> under the title
  width:     560,                       // optional px, default 560
  variant:   'default' | 'wide',        // optional, 'wide' = 960px (for snapshot)
  body:      HTMLElement | string,      // optional, replaces the standard form area
  fields:    [/* field defs, see below */],   // optional convenience for simple forms
  runLabel:  'Generate Report',         // text on the primary button; pass `null` to omit the button
  onClose:   () => { /* cleanup hook */ },     // optional; runs before the overlay is removed
}
```

**`fields[]` entries (simple form helper — for tools with date/text inputs only):**
```js
{ id: 'date',  type: 'date', label: 'Report Date', value: '2026-05-02' }
{ id: 'start', type: 'date', label: 'Week Start (Monday)', value: '2026-04-27' }
{ id: 'end',   type: 'date', label: 'Week End (Sunday)',   value: '2026-05-03' }
{ id: 'monday', type: 'date', label: 'Week Starting (Monday)', value: '2026-04-27',
  hint: row => `Week: ${row.monday} → ${SkylinksUtils.dates.addDays(row.monday, 6)}` }
```
Render two-column grid when there are exactly two `date` fields with ids `start`/`end` (matches existing UI). Otherwise stack vertically.

For tools that need richer body markup (file dropzone in `chronogolf.js`, KPI grid + charts in `snapshot_selectpi.js`), pass `body` as raw HTML string or an element instead of `fields`.

**`ModalHandle` returns:**
```js
{
  overlay,           // the root HTMLElement
  card,              // the white card HTMLElement
  values: () => ({}),// reads current field values, keyed by field id
  setStatus(msg, kind),  // kind: 'info' | 'error' | 'success' | 'warn'; default 'info'
  setProgress(pct),  // 0–100; auto-shows progress bar on first call
  hideProgress(),
  showResult(htmlOrEl),  // injects into the result region
  resetResult(),
  onRun(handler),    // wires the primary button; handler is `async (values, ctx) => …`
                     //   ctx = { setStatus, setProgress, showResult, button: HTMLButtonElement }
                     // Modal handles disable/enable of the button + try/catch → setStatus('error').
  close(),           // programmatic dismiss; runs onClose
  body,              // the inner content container (for direct DOM access)
}
```

**Behavior requirements (these must match the existing scripts):**
- Overlay click outside the card dismisses the modal. Close button (×) dismisses.
- Esc key dismisses (this is **new** — current scripts don't support it; add it because it's the obvious convention).
- A previous overlay with the same id is removed before mounting (`document.getElementById(\`${id}-overlay\`)?.remove()`).
- The primary button shows opacity 0.4 + `disabled` when fields are invalid (T4 doesn't need to validate; T8 plugs that in).
- Status colors must use `theme.color.muted` / `error` / `success` / `warnText`.
- Modal CSS must be inline (no `<style>` injection) **except** when `variant: 'wide'` is used — that variant injects responsive media-query CSS the way `snapshot_selectpi.js:14–40` does today, scoped via id `<id>-responsive`, removed in `onClose`.

**Files:** new `content/core/modal.js`. Do not migrate callers yet.

**Acceptance:**
- A self-test: temporarily inject the file plus utils in DevTools and run:
  ```js
  const m = SkylinksUtils.createModal({ id: 'test', title: 'Test', emoji: '🧪',
    fields: [{ id: 'd', type: 'date', label: 'Date', value: '2026-05-02' }],
    runLabel: 'Run' });
  m.onRun(async (vals, ctx) => { ctx.setProgress(50); await new Promise(r=>setTimeout(r,500)); ctx.setStatus('done', 'success'); });
  ```
  Expected: card appears, has the date input, clicking Run disables button, fills the bar to 50%, sets green status, re-enables button. Clicking ×, the overlay backdrop, or pressing Esc closes the modal.

---

## Task T5 — Create `content/core/api.js` and `paginate.js`

### T5a — `core/api.js`

**API:** `SkylinksUtils.apiClient(config) → client`

**`config` shape:**
```js
{
  baseUrl: 'https://us.merchantos.com/API/Account/305872',  // optional; if absent, paths must be absolute
  auth: 'cookie'                                            // sends `credentials: 'include'`
       | { bearer: 'tok…' }                                 // adds Authorization header
       | { bearerFromLocalStorage: 'token' }                // reads localStorage[key] each call
       | { csrf: () => 'token' },                           // adds X-CSRF-Token via fn (chronogolf)
  defaultHeaders: { Accept: 'application/json' },
  // Optional retry policy applied to GET only by default; opt-in for others.
  retry: { attempts: 2, delayMs: 1000, methods: ['GET'] },
}
```

**Returned `client` methods:**
```js
client.get(path, { headers, query, retry } = {})           // returns parsed JSON
client.post(path, body, { headers, retry } = {})           // body is auto-stringified if object
client.graphql(path, { query, variables, operationName })  // POSTs the GraphQL envelope, throws on errors
client.raw(path, init)                                     // escape hatch returning Response
```

**Error handling:** non-2xx responses throw `Error` with message `${method} ${url} → ${status} ${statusText}`. GraphQL responses with a non-empty `errors` array throw `Error` with all messages joined by `'; '`.

**Replaces:**
- `merchantos.js` `apiFetch`, `apiFetchRetry` (cookie auth, retry on GET)
- `chronogolf.js` `cgFetch` + `getCsrfToken` integration (csrf auth)
- `selectpi.js`, `snapshot_selectpi.js` `post` helpers (bearer-from-localStorage)
- `deputy.js` inline `fetch` calls (cookie auth)
- `perfectvenue.js` inline GraphQL POST (cookie auth + graphql helper)

**Auth implementation note:** keep the auth strategy a function internally so adding a 7th integration with a different auth scheme means adding one branch in `api.js`, not refactoring it.

### T5b — `core/paginate.js`

**API:** `SkylinksUtils.paginate(config) → Promise<Array>`

```js
SkylinksUtils.paginate({
  fetchPage: async (cursor) => Response,    // cursor is whatever you pass as `start`
  start:     0,                              // initial cursor
  getItems:  resp => resp.Sale,              // extract page items (use SkylinksUtils.dom.toArr if needed)
  // EITHER provide a total + step (offset-style, like Lightspeed):
  getTotal:  resp => parseInt(resp['@attributes']?.count || '0', 10),
  pageSize:  100,
  // OR provide a "more pages?" predicate (page-style, like Chronogolf):
  hasMore:   (resp, items) => items.length === 100,
  nextCursor: cursor => cursor + 1,          // default: cursor + pageSize
  parallel:  true,                           // for offset-style fetches with known total
})
```

If `getTotal` is supplied, fan out remaining pages in parallel after the first fetch (mirrors `merchantos.js fetchAllPaged`). If only `hasMore` is supplied, fetch sequentially (mirrors `chronogolf.js loadExistingEmails`).

**Acceptance:**
- New files `content/core/api.js` and `content/core/paginate.js` exist.
- DevTools sanity test (with cookie-auth on Lightspeed):
  ```js
  const c = SkylinksUtils.apiClient({ baseUrl: 'https://us.merchantos.com/API/Account/305872', auth: 'cookie' });
  const cats = await SkylinksUtils.paginate({
    fetchPage: cur => c.get(`/Category.json?limit=100&offset=${cur}`),
    getItems: r => SkylinksUtils.dom.toArr(r.Category),
    getTotal: r => parseInt(r['@attributes']?.count || '0', 10),
    pageSize: 100,
  });
  cats.length;  // matches the count merchantos.js currently logs
  ```

---

## Task T6 — Create `content/core/csv.js`

**Goal:** Replace per-file `[col, col, …].map(escCsv).join(',')` blocks with column specs.

**API:** all on `SkylinksUtils.csv`.

```js
const COLS = [
  { header: 'Transaction ID', value: r => r.transactionID },
  { header: 'Date',           value: r => SkylinksUtils.dates.formatShortDate(r.date) },
  { header: 'Unit Price',     value: r => '$' + r.unitPrice },
];

SkylinksUtils.csv.toCSV(rows, COLS)                  // → string with header + rows
SkylinksUtils.csv.toSection(title, rows, COLS)       // → 'TITLE\nheader\nrow\nrow\n'
SkylinksUtils.csv.joinSections([...])                // → joined with '\n'
SkylinksUtils.csv.toAutoSection(title, models)       // infers cols from Object.keys(models[0]) — ports `selectpi.js sectionToCSV`
SkylinksUtils.csv.parseCSV(text)                     // ports chronogolf.js parseCSV; returns row objects with `_lineNumber`
```

**Edge cases the implementation must preserve:**
- `escCsv` must continue to handle quotes, commas, newlines per `utils.js:7–12`.
- `parseCSV` must normalize `\r\n` and `\r` to `\n`, lowercase header names, and respect quoted fields containing commas.

---

## Task T7 — Create `content/core/download.js`, `copy.js`, `table.js`

These are small and best done in a single task.

### T7a — `core/download.js`

```js
SkylinksUtils.download.csvButton({
  csv:      'Header1,Header2\n…',
  filename: 'sales_lines_2026-05-02.csv',
  label:    '⬇  Download sales_lines_2026-05-02.csv',  // optional, defaults to filename
}) → HTMLAnchorElement   // styled like the current yellow buttons; manages blob URL lifecycle
```

The returned anchor must:
- Use `theme.color.brand` styling that matches the existing buttons.
- Auto-revoke its blob URL 10 seconds after `click` (matches all current scripts).
- Expose a `.dispose()` method that revokes immediately. Modals call this in `onClose`.

### T7b — `core/copy.js`

```js
SkylinksUtils.copy.tableButton({
  html:    '<h3>Heading</h3><table>…</table>',
  label:   '📋  Copy Table to Clipboard',
}) → HTMLButtonElement  // matches the outline-style button in perfectvenue.js / deputy.js
```

Button writes `text/html` to the clipboard via `navigator.clipboard.write(new ClipboardItem({...}))`. On success: temporarily change innerHTML to `'✅  Copied!'` for 2s. On failure: `'❌  Copy failed'` and `console.error`.

### T7c — `core/table.js`

```js
SkylinksUtils.table.render(rows, COLS, {
  totals: { /* optional totals row spec */ },
  cellStyle: 'TD',     // or pass a CSS string; default uses theme.TD
  headerStyle: 'TH',
}) → HTMLTableElement
```

`COLS` reuses the same shape as `csv.toCSV` but with extra rendering hints:
```js
{ header: 'Hours', value: r => r.hrs.toFixed(2), align: 'right', style: r => r.hrs > 40 ? 'color:red' : '' }
```

Tables that current scripts build largely follow this pattern; this consolidates the markup. Tools with bespoke tables (`merchantos.js` discount summary with a TOTAL row, `deputy.js` Proshop/Admin grouping) can still build HTML inline — `table.render` is the easy path, not the only one.

---

## Task T8 — Create `content/core/workflow.js`

**Goal:** A `runReport` combinator that absorbs the validate → disable button → fetch → process → render → re-enable dance every script repeats.

**API:**
```js
SkylinksUtils.runReport({
  modal,                // ModalHandle from createModal
  validate: values => null | string,     // return error string to show; null/undefined = ok
  fetch:    async (values, ctx) => rawData,
  process:  (raw, values) => processed,
  render:   (processed, values, modal) => void,    // free to use download.csvButton etc.
})
```

Implementation orchestrates:
1. On run: read `modal.values()`, run `validate`. If string returned, `setStatus(error, 'error')`, abort.
2. Disable button (`ctx.button` from modal handle), `resetResult()`, `setProgress(0)`.
3. `try { raw = await fetch(values, ctx); processed = await process(raw, values); render(processed, values, modal); } catch (e) { setStatus('❌ Error: ' + e.message, 'error'); console.error(e); }`
4. Re-enable button.

`ctx` is `{ setStatus, setProgress, showResult, button }` (passed through from the modal).

**Acceptance:**
- After T1–T8, an integration's `.onclick` body can be expressed in <30 lines via `runReport`.

---

## Task T9 — Convert `popup.js` to a registry

**Goal:** Replace the if/else chain (`popup.js:10–66`) with a config table.

**Edit:** `popup.js`

```js
const TOOLS = [
  {
    match:  url => url.includes('us.merchantos.com'),
    label:  'Sales Lines Report',
    color:  'btn-blue',
    files:  ['content/merchantos.js'],
  },
  {
    match:  url => url.includes('chronogolf.ca') || url.includes('chronogolf.com'),
    label:  'Import Customers',
    color:  'btn-green',
    files:  ['content/chronogolf.js'],
  },
  {
    match:  url => url.includes('portal.getselectpi.com'),
    label:  'Daily Snapshot Report',
    color:  'btn-purple',
    files:  ['content/vendor/chart.umd.min.js', 'content/snapshot_selectpi.js'],
  },
  {
    match:  url => url.includes('portal.getselectpi.com'),
    label:  'Weekly Earnings Report',
    color:  'btn-purple',
    files:  ['content/selectpi.js'],
  },
  {
    match:  url => url.includes('app.perfectvenue.com'),
    label:  'Weekly Analytics Report',
    color:  'btn-orange',
    files:  ['content/perfectvenue.js'],
  },
  {
    match:  url => url.includes('348a3926020407.na.deputy.com'),
    label:  'Weekly Hours Report',
    color:  'btn-teal',
    files:  ['content/deputy.js'],
  },
];

const CORE_FILES = [
  'content/utils.js',
  'content/core/theme.js',
  'content/core/dom.js',
  'content/core/dates.js',
  'content/core/api.js',
  'content/core/paginate.js',
  'content/core/csv.js',
  'content/core/download.js',
  'content/core/copy.js',
  'content/core/table.js',
  'content/core/modal.js',
  'content/core/workflow.js',
];
```

The popup logic becomes: filter `TOOLS` by `tool.match(url)`, render a button per match, on click call `chrome.scripting.executeScript({ files: [...CORE_FILES, ...tool.files] })`.

**If error message:** when no tools match, show the same fallback error message as today.

**Acceptance:**
- Visually identical to current popup behavior on every supported URL.
- Adding a 7th tool requires only one new entry in the `TOOLS` array (and the new content script file).

---

## Task T10 — Migrate each integration to the shared layer

Once T1–T9 are complete, migrate the six content scripts. **Each migration is its own sub-task and PR-equivalent commit.** Do them in this order; the early ones expose any gaps in the shared layer cheaply.

For every migration:
1. Read the existing file end-to-end before changing anything.
2. Replace overlay/card/status/progress/result/close boilerplate with `createModal`.
3. Replace API calls with `apiClient` + (where applicable) `paginate`.
4. Replace CSV building with `csv.toCSV` / `toSection`.
5. Replace download anchor with `download.csvButton`. Keep the result-area markup structure (`<a>` then optional copy button then summary table) the same.
6. Replace `[Platform Report]` summary table HTML with `table.render` **only if** the call site is straightforward. If the table has merged TOTAL rows or per-row conditional styling that doesn't fit `COLS` cleanly, leave the HTML inline — `table.render` is opt-in.
7. Wrap `.onclick` in `runReport`.
8. Move tool-specific business logic (discount payment-method rules, OU groupings, bucket-name remap, payment-method overrides, etc.) into a `const ...` table at the top of the file. Do **not** push them into core.
9. Run the tool in Chrome. Compare downloaded CSV byte-for-byte against the pre-migration output for the same input.

### T10a — `content/merchantos.js`
- API: cookie auth, baseUrl `https://us.merchantos.com/API/Account/${ACCOUNT_ID}`.
- Use `paginate` for the four paged fetches (active discounts, archived discounts, categories, sales).
- The `linePaymentMethod` IIFE (lines 232–243) must be lifted into a top-of-file `PAYMENT_METHOD_RULES` data table:
  ```js
  const PAYMENT_METHOD_RULES = [
    { when: ({ dName }) => dName === 'Owner Comp', method: 'Owner Comp' },
    { when: ({ dName }) => dName === 'Skylinks Membership Bucket [ARCHIVED]', method: '_X_ 100% - Skylinks Membership' },
    { when: ({ dName }) => dName === '_X_Owner Approved - Security' || dName === '_X_Owner Approved - DJ', method: 'DJ Comps' },
    { when: ({ lineTotal, iName }) => lineTotal === 0 && iName.includes('VIP Voucher'), method: 'VIP Voucher' },
    { when: ({ lineTotal, dName }) => lineTotal === 0 && (dName === 'Beer Bucket Discount 5x$20' || dName === 'Shooter w/Bucket Discount'), method: 'Marketing' },
    { when: ({ lineTotal, iName, cust }) => lineTotal === 0 && iName.includes(' GF') && cust, method: 'Membership Golf Package' },
    { when: ({ lineTotal, dName }) => lineTotal === 0 && dName, method: ({ dName }) => dName },
  ];
  ```
  Then `resolveMethod(ctx) { for (const rule of RULES) if (rule.when(ctx)) return typeof rule.method === 'function' ? rule.method(ctx) : rule.method; return ctx.paymentMethod; }`.
- Discount summary table has a TOTAL row — leave that inline rather than forcing into `table.render`.
- Verification: run for a Saturday with discounts, diff CSV against pre-migration output, confirm `[ARCHIVED]` discounts still resolve (per `tasks/requested_updates_5-1-2026.md`).

### T10b — `content/selectpi.js`
- API: bearer from localStorage `token`, no baseUrl (paths are root-relative).
- Use `csv.toAutoSection` for the four sections; matches existing behavior 1:1.
- Use modal `fields` helper with two date inputs (`start`, `end`).
- Verification: run for the current week, diff CSV against pre-migration.

### T10c — `content/perfectvenue.js`
- API: cookie auth, `apiClient.graphql` for the single GraphQL call.
- The metrics array (`perfectvenue.js:190–198`) maps cleanly to a `COLS`-style spec consumed by both `csv.toCSV` and `table.render`. Build that.
- Copy-to-clipboard becomes `copy.tableButton`.
- Verification: run for current week, diff CSV.

### T10d — `content/deputy.js`
- API: cookie auth, baseUrl is the Deputy host.
- `OU_FALLBACK_NAMES` + `PROSHOP_OU_IDS` + `ADMIN_OU_IDS` consolidate into one `OU_GROUPS` table (see review notes).
- Roster query body is unchanged — pass it through `apiClient.post`.
- The summary table is grouped (Proshop rows, Admin rows, totals) — leave HTML inline; don't force `table.render`.
- Verification: run for current week, confirm hour totals match.

### T10e — `content/chronogolf.js`
- API: csrf-aware client; `getCsrfToken` becomes the `csrf` strategy in `apiClient`.
- `parseCSV` becomes `csv.parseCSV`.
- `loadExistingEmails` becomes `paginate` with `hasMore: (_, items) => items.length === 100`.
- Modal `body` is custom (file dropzone + affiliation chip area + preflight); pass it as raw HTML/element rather than using `fields`.
- The import flow doesn't fit `runReport` cleanly (file-driven, not button-driven). It's fine to leave the `.onclick` orchestration custom — the boilerplate-removal wins from `createModal` + `apiClient` + `csv.parseCSV` are already substantial.
- Verification: dry-run import with a small CSV (1–2 rows), confirm "Created" / "Skipped (duplicate)" outcomes match pre-migration.

### T10f — `content/snapshot_selectpi.js`
- API: bearer from localStorage `token`.
- Modal `variant: 'wide'` with custom `body` HTML for the KPI grid + chart cards. Don't force this into `fields`.
- Chart.js code stays inline for now — extracting chart factories is a **separate** future task; do not bundle it here.
- The `BUCKET_NAME_MAP`, `STATION_NAME_COLORS`, `FALLBACK_PALETTE`, `BUCKET_AMBER` constants stay in this file (tool-specific).
- The local `TD`/`TH` redefinition in `render()` (denser table for the snapshot) stays — it intentionally differs from `theme.TD`/`TH`.
- Verification: open on a day with data, verify all 5 charts render, refresh works, close cleans up `state.charts` and the responsive `<style>` element.

---

## After T10 — Cleanup

Once all six content scripts are migrated, do a final sweep:

1. `content/utils.js` should now be a thin file exposing only what predates the refactor, and everything new lives in `core/`. If any old utility is now superseded by a `core/` equivalent, remove it from `utils.js` and update the agent task that proves no remaining caller uses it.
2. Run the diff:
   ```
   git diff --stat main...HEAD -- content/
   ```
   Each migrated content script should be **shorter**. If any script grew, audit it before merging.
3. Update `CLAUDE.md` "Architecture" section: add a "Shared core layer" subsection summarizing what each `core/*.js` file provides, and replace the "Shared utilities: `content/utils.js`" subsection to point at the new layout.
4. Add a short `docs/adding_a_new_tool.md` walkthrough showing the boilerplate template for tool #7.

---

## What this plan deliberately does NOT include

These were considered and rejected as either premature or out-of-scope. Do not bundle them into any task above.

- **TypeScript / build step / bundler.** CLAUDE.md flags vanilla JS as deliberate.
- **A class hierarchy ("`BaseTool`").** Function composition is sufficient.
- **A templating library.** Tagged-template literals if needed; nothing more.
- **Centralizing tool-specific business logic** (discount payment-method overrides, OU groupings, bucket name maps). They belong with their tool.
- **Chart.js wrapper / chart factories** — defer to a follow-up task once the snapshot tool grows a sibling.
- **Redesigning UI / changing copy / changing theme colors** — refactor is internal only.
- **Fixing bugs encountered during migration** — note them in "Discovered issues" below; address in dedicated follow-up tasks.

---

## Discovered issues (append here as you go)

> Format: `- [Tnnx] short description — file:line`

- [T10-cleanup] CLAUDE.md was overwritten by KoadOS agent-boot during a prior session — recovered via `git show HEAD:CLAUDE.md`, then updated with refactor architecture docs.
- [T10f] snapshot_selectpi: `createModal` `variant:'wide'` injects generic responsive CSS only. The snapshot's complex KPI/bucket/mobile-card layout requires a separate `sps-responsive` stylesheet injected into `<head>` and removed in `onClose`.
- [T10f] snapshot amber header: `createModal` card has `padding:28px 32px`. Edge-to-edge amber header compensated with `margin:-28px -32px 24px` on the amber div in BODY_HTML.
