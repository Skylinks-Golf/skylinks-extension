<aside>
🎯

**One-liner.** A Chrome-extension overlay, available while logged into `portal.getselectpi.com`, that fetches a single day of operational data from the SelectPi reporting API and presents it as a clean, at-a-glance dashboard with KPIs, charts, and breakdowns. Defaults to today; any single day is selectable.

</aside>

## Goals

- Give Skylinks staff a **fast, detailed daily look** at dispenser activity and ball-bay revenue without leaving the SelectPi portal.
- Be **legible to non-technical staff** — visuals first, raw numbers supporting them.
- Stay **consistent with the existing extension architecture** (vanilla JS, MV3, one self-contained content script per feature).
- Match the **Skylinks brand palette** in chrome (header, buttons), but use **task-appropriate colors inside charts** for clarity (e.g., differentiating LEFT vs RIGHT, bucket sizes).

## Non-Goals

- No multi-day ranges, week comparisons, or trend lines (that's what the existing Weekly Earnings Report covers).
- No data export (no CSV download). This is a **viewing tool**, not a reporting tool.
- No persistence — overlay is ephemeral, no saved state between sessions.
- No edits or writes to SelectPi data.

## Stack Decision

<aside>
⛳

**Library:** Chart.js (UMD build, vendored locally). **Framework:** none — keep the existing vanilla DOM + `innerHTML` + `getElementById` idiom that all 5 sibling content scripts use.

</aside>

**Why Chart.js:**

- MV3 CSP forbids remote code → must be vendored locally; Chart.js ships a single UMD file that drops in cleanly.
- ~62KB gzipped — meaningful but acceptable for a chart-heavy feature.
- Native support for every chart type this spec needs (donut, bar, grouped bar, horizontal bar) with zero hand-rolled SVG.
- No build step required → matches the rest of the project, which has no `package.json`, no bundler, no `dist/`.

**Why no framework (Alpine, Preact, etc.):**

- Would be the only reactive layer in the entire extension, breaking consistency with `chronogolf.js`, `merchantos.js`, `selectpi.js`, `perfectvenue.js`, `deputy.js`.
- Alpine specifically risks attribute-scan conflicts with the Vue 3 SPA host page.
- The existing `selectpi.js` already proves async state + progress + conditional rendering work fine in plain DOM.

## File Changes

### New files

- `content/vendor/chart.umd.min.js` — Chart.js v4.x UM D build, committed as-is. Pin the exact version in a comment header at the top.
- `content/snapshot_selectpi.js` — the new content script. Parallel to the existing `content/selectpi.js`, not a replacement.

### Modified files

- `popup.js` — add a second button under the existing `portal.getselectpi.com` branch. Inject `utils.js` + `chart.umd.min.js` + `snapshot_selectpi.js` together via `chrome.scripting.executeScript({ files: [...] })`.
- `manifest.json` — **no changes needed.** Existing host permission for `portal.getselectpi.com/*` covers it; `web_accessible_resources` is not required because the file is loaded via `executeScript`, not by the page itself.

### Untouched

- `content/selectpi.js` — leave the Weekly Earnings Report alone. The two coexist as separate buttons.
- `content/utils.js` — already provides `escHtml`, `escCsv`, `makeLogger`. Reuse `escHtml` and `makeLogger`. No additions needed.

## Popup Integration

Under the existing `else if (url.includes('portal.getselectpi.com'))` branch in `popup.js`, append a second button so the SelectPi branch produces two buttons in this order:

1. **Daily Snapshot Report** *(new — primary, default-action feel)*
2. **Weekly Earnings Report** *(existing)*

Both share the purple style class (`btn btn-purple`) for visual grouping under SelectPi.

The new button's click handler:

```jsx
btn.onclick = () => {
	chrome.scripting.executeScript({
		target: { tabId: tab.id },
		files: [
			'content/utils.js',
			'content/vendor/chart.umd.min.js',
			'content/snapshot_selectpi.js',
		],
	});
	window.close();
};
```

## User Flow

1. User is logged into `portal.getselectpi.com` and clicks the Skylinks Tools extension icon.
2. Popup shows two SelectPi buttons; user clicks **Daily Snapshot Report**.
3. Overlay opens immediately, defaulting to today's date. A single date picker is visible at the top.
4. Loading state appears (skeleton or spinner) while four endpoints fetch in parallel.
5. Dashboard renders: KPI row at top, charts in a grid below, station/bucket tables at the bottom.
6. User can change the date → "Refresh" button re-fetches and re-renders in place.
7. User clicks the close button (or backdrop) → overlay disposes; chart instances are destroyed; no residue on the page.

## Overlay Layout

Follow the established `selectpi.js` overlay shell exactly: fixed full-viewport backdrop at `rgba(0,0,0,0.65)`, `z-index: 999999`, centered white card with `border-radius: 14px`, max-width ~960px (wider than the existing 560px because this view is dashboard-shaped, not form-shaped), `max-height: 90vh`, `overflow-y: auto`.

### Header strip

- Skylinks gold accent bar (`#eeb02b`) along the top of the card.
- Title: **"Daily Snapshot — Select Pi"** (Trebuchet MS, bold).
- Subtitle: human-friendly date string (e.g., "Thursday, Apr 30, 2026").
- Right side: date picker + **Refresh** button + **Close (×)** button.

### Body sections (top to bottom)

1. **KPI row** — 3 large cards side by side
2. **Ball dispensing breakdown** — 2 charts side by side (LEFT/RIGHT donut + by-station bar)
3. **Hourly activity** — full-width bar chart
4. **Bucket sales** — table + horizontal bar combo

Use a CSS grid for the body so it collapses to a single column under ~720px.

## KPI Row

Three cards, each: large bold number, small label below, optional sublabel for context.

| Card | Big Number | Label | Sublabel |
| --- | --- | --- | --- |
| Total Income from Dispensers | `$1,234.56` | Dispenser Income | Today |
| Total Balls Dispensed | `8,420` | Balls Dispensed | combined LEFT + RIGHT |
| Total Buckets Sold | `124` ($1,890) | Buckets Sold | qty • revenue |

Card styling: white background, `1px solid #d1d5db`, `border-radius: 12px`, soft shadow, gold left border (`4px solid #eeb02b`) for visual brand cue. Number font-size ~28–32px, label 12–13px uppercase muted.

## Visualizations

### 1. Balls Dispensed — LEFT vs RIGHT

- **Type:** Doughnut chart (Chart.js `doughnut`)
- **Data source:** `api/Report/BallsDispensedByLocation`
- **Two slices:** LEFT (station `142bac96-23e9-4954-9648-1094d6234107`), RIGHT (station `11be5d70-...`)
- **Colors:** distinct, accessible — suggest **teal `#0d9488`** for LEFT and **orange `#ea580c`** for RIGHT (avoid Skylinks gold here; it has to read as a category label).
- **Center label:** combined total balls.
- **Legend:** below chart, with raw counts and percentages.

### 2. Balls Dispensed — by Station

- **Type:** Vertical bar chart
- **Data source:** same `BallsDispensedByLocation` response, but rendered as bars rather than slices for direct numeric comparison.
- One bar per station, colored to match the donut (teal for LEFT, orange for RIGHT). Useful when more stations are added later.
- Y-axis: balls dispensed; X-axis: station name.

### 3. Balls Dispensed — by Hour

- **Type:** Vertical bar chart, full width of the card
- **Data source:** `api/Report/BallsDispensedByHour`
- **X-axis:** 24 hourly buckets, labeled `12a, 1a, 2a, … 11p` (12-hour clock for non-tech readability).
- **Y-axis:** balls dispensed in that hour.
- **Stacked option:** if the endpoint returns LEFT/RIGHT splits, render as a **stacked bar** so each hour shows total height plus L/R composition. Use the same teal/orange colors for stack consistency.
- Bar color (single-series fallback): Skylinks gold `#eeb02b`.

### 4. Bucket Sales — by Size

Two views in one section, side by side:

**4a. Horizontal bar chart**

- **Type:** Horizontal bar (Chart.js `bar` with `indexAxis: 'y'`)
- **Data source:** `api/Report/TotalsByBucketSize`
- **Y-axis labels:** Warm Up, Large, Jumbo, Mega (matching Skylinks hotkey naming).
- **X-axis:** quantity sold.
- **Bar colors:** sequential ramp — light to dark — to imply size progression. Suggest amber ramp (`#fde68a → #f59e0b → #b45309 → #78350f`).

**4b. Companion table**

Compact `skylinks-table` styling (light grid, header-row only):

| Bucket | Qty Sold | % of Total | Revenue |
| --- | --- | --- | --- |
| Warm Up ($5) | 12 | 9.7% | $60.00 |
| Large ($12) | 64 | 51.6% | $768.00 |
| Jumbo ($17) | 32 | 25.8% | $544.00 |
| Mega ($20) | 16 | 12.9% | $320.00 |
| **Total** | **124** | **100%** | **$1,692.00** |

Percentages calculated client-side: `qty / totalQty * 100`, rounded to 1 decimal.

## Data & API Calls

### Auth

Same pattern as existing `selectpi.js`:

```jsx
const token = localStorage.getItem('token');
if (!token) { alert('Skylinks Tools: No auth token found in localStorage. Make sure you are logged into the SelectPi Portal.'); return; }

const headers = {
	'Content-Type': 'application/json',
	'Authorization': `Bearer ${token}`,
};
```

All endpoints are relative paths on `portal.getselectpi.com`, all are `POST` with JSON bodies.

### Endpoints (parallel `Promise.all`)

| # | Endpoint | Body | Used for |
| --- | --- | --- | --- |
| 1 | `/api/Report/Summary` | `{ start: date, end: date }` | KPI: total income, total balls dispensed |
| 2 | `/api/Report/EarningsAtDispenser` | `{ start: date, end: date }` | KPI: dispenser income (cross-check Summary) |
| 3 | `/api/Report/BallsDispensedByLocation` | `{ start: date, end: date }` | LEFT/RIGHT donut + by-station bar |
| 4 | `/api/Report/BallsDispensedByHour` | `{ start: date, end: date, getMinutes: false }` | Hourly bar chart |
| 5 | `/api/Report/TotalsByBucketSize` | `{ start: date, end: date }` | Bucket size table + horizontal bar |

<aside>
📘

Field shapes for each response are documented in the Select Pi API reference page. Always read `models[]` (consistent across all SelectPi report endpoints).

</aside>

### Single-day window

For a daily snapshot, both `start` and `end` are the same `YYYY-MM-DD` string. Confirm with the API team / by smoke test that this returns the full day's data; if not, set `end = start + 1 day` and document the off-by-one rule in a code comment.

## Defaults & Date Selection

- **Default date:** today's date in the user's local timezone, formatted `YYYY-MM-DD`. Use `new Date().toISOString().slice(0, 10)` adjusted for local TZ — copy the existing `pacificMidnightAsUTC` helper from `merchantos.js` if you need a Pacific-anchored day.
- **Date picker:** native `<input type="date">` styled with the existing `.skylinks-input` look (10–12px padding, border `#d1d5db`, radius 8px). No date range, single day only.
- **Refresh trigger:** changing the date *or* clicking Refresh re-runs all 5 fetches and re-renders charts in place. Destroy old Chart.js instances first (`chart.destroy()`) to prevent canvas leaks.
- **Disabled future dates:** set `max` attribute on the date input to today.

## Loading & Error States

- On first load and on every refresh: show a **progress bar** (gold fill on light gray track), exactly like the existing `sp-progress` / `sp-bar` pattern in `selectpi.js`. Increment as each endpoint resolves.
- On any endpoint failure: show a red banner above the dashboard — `❌ Failed to load: <endpoint name> (<status>)` — but render whatever data did succeed. Do not blank the whole UI on a single failure.
- If `localStorage.getItem('token')` is missing or expired: show the same alert pattern as `selectpi.js` and abort.

## Style & Branding

- **Card chrome:** Skylinks brand. Gold accent (`#eeb02b`), ink (`#262b2f`), Segoe UI body, Trebuchet MS headings. Match the visual language of the existing overlays.
- **Inside charts:** **task-appropriate colors over Skylinks branding.** Per the user's explicit requirement, the visualizations should prioritize legibility:
    - LEFT vs RIGHT → teal `#0d9488` / orange `#ea580c` (clear category contrast)
    - Bucket sizes → amber sequential ramp (implies size progression)
    - Single-series fallback → Skylinks gold `#eeb02b` is fine
- Buttons (close, refresh): match the existing `.btn` style in `popup.html` — gold background, dark text, 10px radius.
- All inline styles, consistent with the rest of the extension. **Do not** import `docs/skylinks-style.css` — that's WordPress-only.

## Code Structure (suggested)

Keep `snapshot_selectpi.js` as a single IIFE, just like `selectpi.js`. Suggested internal organization:

```jsx
(function SelectPiSnapshotUI() {
	// 1. Auth check
	// 2. Build overlay DOM (innerHTML template)
	// 3. State: { date, charts: {...}, lastData: {...} }
	// 4. fetchAll(date) → Promise.all of 5 POSTs
	// 5. render(data) → updates KPIs, (re)creates Chart.js instances
	// 6. destroyCharts() → call before re-render and on close
	// 7. Wire up: date change, refresh click, close click, backdrop click
	// 8. Initial load with today's date
})();
```

Reuse `window.SkylinksUtils.escHtml` and `window.SkylinksUtils.makeLogger('SP Snapshot')` to match existing logging conventions.

## Acceptance Criteria

- [ ]  Clicking the **Daily Snapshot Report** button on the SelectPi portal opens an overlay within 200ms (before data loads).
- [ ]  Overlay defaults to today's date, fully populated within ~2s on a normal connection.
- [ ]  All 5 endpoints are called in parallel (verifiable in DevTools Network tab — they should start within the same animation frame).
- [ ]  All three KPI cards display correct values matching the Summary endpoint output.
- [ ]  LEFT/RIGHT donut percentages sum to 100% (±0.1% rounding).
- [ ]  Bucket size table percentages sum to 100% (±0.1%) and revenue column matches `TotalsByBucketSize` response.
- [ ]  Changing the date triggers a single re-fetch + re-render with no duplicate Chart.js instances on the canvas (check via DevTools — only one chart per `<canvas>`).
- [ ]  Closing the overlay (× button or backdrop click) removes it from the DOM and destroys all chart instances.
- [ ]  If auth token is missing, the same alert pattern as `selectpi.js` fires; no overlay opens.
- [ ]  Layout is legible at 1280×800 and remains usable down to 720px wide (single-column collapse).
- [ ]  Existing **Weekly Earnings Report** continues to work unchanged.

## Out of Scope (for v1)

- Period comparisons (yesterday vs today, this Tue vs last Tue).
- Lesson revenue, range card sales, food/beverage — only ball-bay operational data.
- Cashier breakdowns (those live in the weekly report).
- Mobile / extension popup view of the dashboard (overlay assumes desktop viewport).
- Saved presets, favorites, or scheduled refresh.
- Permission gating per user role.

## Open Questions

- **Single-day request format.** Confirm whether SelectPi's report endpoints treat `{ start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }` (same date) as a full-day window or as a zero-length range. If the latter, code path needs `end = start + 1 day` with a comment. Current `selectpi.js` uses week ranges so this hasn't been tested.
- **Income source of truth.** `Summary.totalIncome` vs sum of `EarningsAtDispenser.models[].amount` — pick one as the displayed KPI and document the choice. Recommend `Summary.totalIncome` for consistency with SelectPi's own UI.
- **Hourly endpoint splits.** Verify whether `BallsDispensedByHour` returns LEFT/RIGHT separately (enables stacked bars) or only combined totals. Adjust chart 3 accordingly.
- **Future stations.** Code should not hardcode "only LEFT and RIGHT" — drive the donut/bar from whatever stations the response returns. Color map can stay hardcoded for the two known IDs, with a fallback palette for unknowns.