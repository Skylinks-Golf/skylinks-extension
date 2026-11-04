<aside>
🎯

**One-liner.** A Chrome-extension overlay, available while logged into `us.merchantos.com`, that fetches a single day of POS data from the Lightspeed Retail API and presents it as a clean, at-a-glance dashboard with KPIs, charts, and breakdowns — with first-class **day-vs-day comparison** baked into every visualization. Defaults to today vs the trailing 4-week same-weekday average; any single day and any baseline are selectable.

</aside>

## Goals

- Give Skylinks staff a **fast, detailed daily look** at retail POS activity (sales, payments, items, discounts, refunds) without leaving the Lightspeed admin UI.
- Make **comparison the first-class citizen.** Every KPI and most charts answer "is today normal?" not just "what happened today?"
- Be **legible to non-technical staff** — visuals first, raw numbers supporting them.
- Stay **consistent with the existing extension architecture** (vanilla JS, MV3, one self-contained content script per feature).
- Match the **Skylinks brand palette** in chrome (header, buttons), but use **task-appropriate colors inside charts** for clarity (today vs baseline contrast, payment-type categorical palette, etc.).

## Non-Goals

- No multi-day report ranges (this is a single-day snapshot, with a single comparison anchor).
- No data export (no CSV download). The existing **Sales Lines Report** in `merchantos.js` already covers CSV needs.
- No persistence — overlay is ephemeral, no saved state between sessions. (Comparison-anchor selection is in-session only.)
- No edits or writes to Lightspeed data.
- No employee/cashier performance breakdown in v1 (politically sensitive — separate feature).
- No tax breakdowns or COGS / margin in v1.

## Stack Decision

<aside>
⛳

**Library:** Chart.js (UMD build, vendored locally — already shipped for SelectPi snapshot). **Framework:** none — keep the existing vanilla DOM + `innerHTML` + `getElementById` idiom that all sibling content scripts use.

</aside>

**Why Chart.js:**

- Already vendored at `content/vendor/chart.umd.min.js` for `snapshot_selectpi.js`. Reuse it as-is.
- Native support for every chart type this spec needs (grouped bar, stacked horizontal bar, line+bar combo, sparkline-style mini bars).
- No build step required → matches the rest of the project.

**Why no framework:**

- Would be the only reactive layer in the extension, breaking consistency with `chronogolf.js`, `merchantos.js`, `selectpi.js`, `snapshot_selectpi.js`, `perfectvenue.js`, `deputy.js`.
- Comparison-driven re-rendering is naturally handled by destroy-and-recreate on Chart.js, not by a reactive layer.

## File Changes

### New files

- `content/snapshot_merchantos.js` — the new content script. Parallel to the existing `content/merchantos.js` (Sales Lines Report), not a replacement.

### Modified files

- `popup.js` — add a new button under the existing `us.merchantos.com` branch. Inject `utils.js` + `chart.umd.min.js` + `snapshot_merchantos.js` together via `chrome.scripting.executeScript({ files: [...] })`.
- `manifest.json` — **no changes needed.** Existing host permission for `us.merchantos.com/*` covers it; `web_accessible_resources` not required because the file is loaded via `executeScript`.

### Untouched

- `content/merchantos.js` — leave the Sales Lines Report alone. The two coexist as separate buttons.
- `content/vendor/chart.umd.min.js` — already present from SelectPi snapshot work.
- `content/utils.js` — reuse `escHtml`, `makeLogger`, `apiClient`, `dates` helpers. No additions needed.

## Popup Integration

Under the existing `else if (url.includes('us.merchantos.com'))` branch in `popup.js`, append a new button so the Lightspeed branch produces buttons in this order:

1. **Daily Snapshot Report** *(new — primary, default-action feel)*
2. **Sales Lines Report** *(existing CSV export)*
3. *(any other existing Lightspeed buttons retain their order below)*

All share the existing Lightspeed button style class for visual grouping.

The new button's click handler:

```jsx
btn.onclick = () => {
	chrome.scripting.executeScript({
		target: { tabId: tab.id },
		files: [
			'content/utils.js',
			'content/vendor/chart.umd.min.js',
			'content/snapshot_merchantos.js',
		],
	});
	window.close();
};
```

## User Flow

1. User is logged into `us.merchantos.com` and clicks the Skylinks Tools extension icon.
2. Popup shows the Lightspeed buttons; user clicks **Daily Snapshot Report**.
3. Overlay opens immediately, defaulting to today's date and **vs 4-wk same-weekday avg** as the comparison baseline.
4. Loading state appears (skeleton + progress bar) while today's `Sale.json` paginated fetch runs.
5. Today's KPIs and charts render the moment today's data lands.
6. Baseline data fetches in parallel; baseline overlays (delta chips, baseline lines, grouped baseline bars) fade in independently when ready.
7. User can change the date *or* the comparison anchor → the affected fetches re-run and charts re-render in place. Cached datasets (within session) don't re-fetch.
8. User clicks the close button (or backdrop) → overlay disposes; chart instances are destroyed; no residue on the page.

## Overlay Layout

Follow the established `snapshot_selectpi.js` overlay shell exactly: fixed full-viewport backdrop at `rgba(0,0,0,0.65)`, `z-index: 999999`, centered white card with `border-radius: 14px`, **max-width ~1100px** (wider than SelectPi's 960px because retail data is denser), `max-height: 90vh`, `overflow-y: auto`.

### Header strip

- Skylinks gold accent bar (`#eeb02b`) along the top of the card.
- Title: **"Daily Snapshot — Lightspeed Retail"** (Trebuchet MS, bold).
- Subtitle: human-friendly date string (e.g., "Tuesday, May 5, 2026"). For in-progress days, append "as of 11:00 AM".
- Right side: date picker + comparison-anchor segmented control + **Refresh** button + **Close (×)** button.

### Body sections (top to bottom)

1. **KPI row** — 4 cards with delta chips
2. **Sparkline trend strip** — last 14 same-weekdays per key KPI
3. **Exception strip** — comparison-aware flags
4. **Hourly sales** — bar (today) + line/band (baseline), full width
5. **Department mix** — grouped bar (today vs baseline)
6. **Payment method mix** — two stacked horizontal bars
7. **Top items — winners and losers** — two side-by-side lists
8. **Discounts applied** — table
9. **Refunds & voids** — table

Use a CSS grid for the body so it collapses to a single column under ~820px.

## Comparison Framework

<aside>
📐

Comparison is the dashboard's spine. Every KPI and most charts have a **today series** and a **baseline series**. The user picks the baseline once; the whole dashboard reflects it.

</aside>

### Comparison anchors (segmented control)

| Label | Definition | When to use |
| --- | --- | --- |
| vs Yesterday | The calendar day immediately prior to the selected day. | Day-to-day continuity check. |
| vs Last [Weekday] | Same day-of-week, 7 days prior. Label adapts ("vs Last Tue"). | Cleanest single-day comparison — golf demand is highly day-of-week dependent. |
| vs 4-wk [Weekday] avg **(default)** | Average of the trailing 4 same-weekdays (excluding the selected day). | Most stable baseline — smooths out one-off bad/good days. |
| vs Last Year | Same calendar date, 1 year prior. | Seasonality + YoY growth. |
| Custom… | Opens a second date picker. | Ad-hoc comparison (e.g., comparing to a specific event day). |
- Default selection: **vs 4-wk same-weekday avg.**
- Selection persists for the session, not across sessions.
- For 4-wk avg, baseline is the *mean* of 4 days. Sparkline strip shows all 4 individually.

### Same-time clip for in-progress days

When the selected day is **today and not yet end-of-business**:

- The baseline series is **truncated to the same hour-of-day** as the current local time.
- Subtitle reads "as of HH:MM".
- Delta chips compare today's partial total to the baseline's partial total — never to a full baseline day.
- For 4-wk avg, each of the 4 baseline days is truncated to the same hour, then averaged.

This prevents the misleading "−60% vs Last Tue" at 11am when the day's only half over.

### No-baseline-data handling

- Show a soft empty state in delta chips: "— no comparison data —".
- Render today's series only; gray out baseline overlays.
- Common cases: comparing to a closed day, to a date before Skylinks operated at this location, or to a future date.

## KPI Row

4 cards, each: large bold number, small label, sublabel for context, **delta chip** below.

| Card | Big Number | Label | Delta chip rules |
| --- | --- | --- | --- |
| Gross Sales | `$3,482.10` | Gross Sales · Today | ▲ green = up, ▼ red = down, ● gray = within ±2% |
| Transactions | `87` | Transactions | Same as Gross Sales |
| Avg Ticket | `$40.02` | Avg Ticket | Same as Gross Sales |
| Net After Refunds &amp; Discounts | `$3,141.55` | Net Revenue | Same as Gross Sales |

**Delta chip format:** `▲ +12.4% vs Last Tue ($3,098.40)` — direction arrow, percent change, baseline label, baseline absolute value in parens.

**Metric-aware coloring:** for KPIs where "down" is good (none in v1, but applies to future cards like "Refund Total" or "% Discounted"), invert the green/red logic. Encode this in the card's metric definition, not in the chip rendering.

Card styling: white background, `1px solid #d1d5db`, `border-radius: 12px`, soft shadow, gold left border (`4px solid #eeb02b`). Number font-size ~28–32px, label 12–13px uppercase muted, delta chip ~11–12px with rounded-pill background.

## Sparkline Trend Strip

A slim horizontal strip below the KPI row showing the **last 14 same-weekdays** for each headline KPI. 3–4 sparklines, side-by-side.

Example:

```
Gross Sales · last 14 Tuesdays
▁▂▃▂▄▃▅▄▆▅▇▆█▇   ← today highlighted gold, prior 13 in gray
```

- Each sparkline is a Chart.js mini bar chart with no axes, no legend, fixed height ~28px.
- Today's bar is rendered in Skylinks gold; the prior 13 in `#9ca3af`.
- Hover reveals each bar's date and value.
- Sparklines: **Gross Sales**, **Transactions**, **Avg Ticket**, *(stretch)* **% Discounted**.
- This strip gives instant trend context without a separate chart and is independent of the comparison-anchor picker.

## Exception Strip

Comparison-aware flag chips in a single horizontal row above the charts. Each chip is clickable to expand the relevant table/chart inline.

Flag rules (drive each from comparison data, not absolute thresholds):

- ⚠️ **Discount $ is N× higher than baseline** (threshold: ≥2× and ≥$50)
- ⚠️ **Refund count is N× the baseline** (threshold: ≥3× and ≥3 refunds)
- ⚠️ **Range revenue down ≥30% vs baseline**
- ⚠️ **Department X up/down ≥40% vs baseline**
- ⚠️ **Gift cards activated with no matching invoice** (absolute check, not comparison-based — same condition the daily brief flagged historically)
- ⚠️ **Member bucket discount applied to non-member transaction** (heuristic — discount name matches `_X_memberships_*` but customer profile lacks member tag)
- ⚠️ **House account charges today** (absolute, with running total)
- ⚠️ **Discount > 50% on a single line item** (loss-leader catch)
- ⚠️ **Sales after closing hour** (clock drift / late edits)
- ✅ **No exceptions detected** (green chip when all checks pass — celebratory empty state)
- ✅ **F&amp;B up ≥25% vs baseline** (positive flag, also celebratory)

Keep flag count tight. If more than 5 fire simultaneously, group the lowest-priority into a "+N more" overflow chip.

## Visualizations

### 1. Hourly Sales — bar + baseline line

- **Type:** Combo chart — Chart.js `bar` dataset + `line` dataset on shared axes.
- **Data source:** today's `Sale.json` aggregated to 24 hourly buckets + baseline `Sale.json` aggregated identically.
- **Today series:** vertical bars in Skylinks gold (`#eeb02b`).
- **Baseline series:** dashed line in `#6b7280` (gray) over the bars.
- **Optional shaded band:** for 4-wk avg anchor, render the min/max envelope across the 4 baseline days as a translucent gray band — "today should land inside this band on a normal Tuesday."
- **X-axis:** 24 hourly buckets, labeled `12a, 1a, … 11p` (12-hour clock).
- **Y-axis:** sales $ in that hour.
- **In-progress clip:** grey out hours after the current local hour for in-progress days.
- **Single most valuable chart in the dashboard.** Tells you instantly whether the curve shape matches a typical day, not just whether totals match.

### 2. Department Mix — grouped bar

- **Type:** Grouped horizontal bar.
- **Data source:** sale lines grouped by department/category.
- For each department, two bars side-by-side: today (solid gold) vs baseline (striped gray).
- **Sort options (toggle):** by today's $, by absolute $ delta, or alphabetical. Default: by today's $.
- Departments to include: Pro Shop, Range, F&amp;B, Lessons, Gift Cards, Other (catch-all).
- Companion compact table below shows: department, today $, baseline $, Δ$, Δ%.

### 3. Payment Method Mix — stacked horizontal bars

- **Type:** Two horizontal stacked bars, one above the other, normalized to 100% width.
- **Data source:** `SalePayments` aggregated by payment type.
- **Top bar:** today. **Bottom bar:** baseline.
- Categorical palette (no Skylinks gold inside): Cash, Credit, Range Card, Gift Card, House Account, Member Bucket, Pin Ticket, Other.
- Below the bars, a compact table with payment type, today $ + count, baseline $ + count, Δ.
- Especially valuable for catching cash-handling shifts and drawer reconciliation.

### 4. Top Items — Winners &amp; Losers

Replaces a single "Top 10" with two side-by-side lists driven entirely by comparison.

| 🔼 Bigger than baseline | 🔽 Smaller than baseline |
| --- | --- |
| Pro V1 Sleeve · +18 units | Energy Bars · −7 |
| Skylinks Hat · +6 | Glove (M) · −4 |
- Filter: only show items with absolute delta ≥ 3 units **or** ≥ $25 revenue. Hides noise.
- Each row also shows today's qty and revenue on hover.
- Limit to top 8 per side; show "+N more" if exceeded.
- For "vs Last Year," item match is by SKU; if SKU doesn't exist in baseline, item is treated as new (▲ green "NEW" tag).

### 5. Discounts Applied — table

Row per discount:

- Discount name (with `[ARCHIVED]` flag if applicable)
- Qty applied (today)
- Gross discount $ (today)
- Payment type override, if any (e.g., `_X_memberships_*` → "X 100% - Skylinks Membership")
- Δ vs baseline (qty + $)

Highlight `_X_memberships_*` discounts in a slightly tinted row to make member usage visible at a glance. Surfaces the same class of issues the existing Sales Lines Report fixes were aimed at (archived discount handling, member bucket payment_type sanity).

### 6. Refunds &amp; Voids — table

Row per refund/void:

- Time, employee, amount, reason (if captured), original sale ID (linkable).
- Header chip: "`5 refunds today · vs baseline avg of 1.8`".
- Empty state: ✅ "No refunds today" (positive empty state, not a gap).

## Data &amp; API Calls

### Auth

Session-cookie based (the active browser session). The extension inherits the logged-in session automatically — no token handling needed, unlike SelectPi.

```jsx
const response = await fetch(url, { credentials: 'include' });
```

If the user is not logged in (response 401/redirect to login), show the same alert pattern as `selectpi.js` and abort.

### Primary endpoint — REST JSON

<aside>
📘

For v1, all data is sourced from a single endpoint: `Sale.json` with relations loaded. Aggregation happens client-side. Field shapes documented in the Lightspeed Retail API reference page.

</aside>

```
GET https://us.merchantos.com/API/Account/305872/Sale.json
  ?completed=true
  &timeStamp=>,YYYY-MM-DDT00:00:00
  &timeStamp=<,YYYY-MM-DDT23:59:59
  &load_relations=["SaleLines","SalePayments","Customer","Employee","Discount"]
  &limit=100
  &offset=0
```

- Paginate by incrementing `offset` until `@attributes.count` is exhausted.
- All `timeStamp` bounds are Pacific-anchored — reuse `pacificMidnightAsUTC` from `merchantos.js`.
- Single endpoint per day → ~95% of every chart's needs.

### Datasets to fetch

Driven by selected day + comparison anchor:

| # | Dataset | When fetched |
| --- | --- | --- |
| 1 | Today (selected day) | Always, immediately on open / refresh / date change |
| 2 | Baseline anchor (yesterday / last weekday / last year / custom) | When that anchor is selected, in parallel with #1 |
| 3 | Trailing 4 same-weekdays | When **vs 4-wk avg** is selected, in parallel with #1 |
| 4 | Trailing 13 same-weekdays (sparkline) | Always, lazy — fetched after #1–3 resolve so it doesn't block the dashboard |

**Worst case:** ~6 concurrent paginated fetches (today + 4 baseline + 1 sparkline backfill that itself spans 13 days but each is small).

### Client-side caching

Keep an **in-memory cache keyed by `YYYY-MM-DD`** of the aggregated dataset (not the raw `Sale.json`):

```jsx
const cache = new Map(); // 'YYYY-MM-DD' -> { kpis, byHour, byDept, byPayment, items, discounts, refunds }
```

- Switching the comparison anchor should be near-instant when data is already cached.
- Cache lives for the session only (cleared on overlay close).
- Today's date is **never cached** — always re-fetched on Refresh, since it's still in-progress.

### Aggregator

A pure function `aggregate(sales) → { kpis, byHour, byDept, byPayment, items, discounts, refunds }`. Called once per dataset. Same function for today and baseline. Keeps comparison logic trivial: `compare(todayAgg, baselineAgg)`.

For 4-wk avg: aggregate each of the 4 days individually, then average the four aggregations into a synthetic baseline. Preserve per-hour and per-department arrays so the min/max envelope can be computed for the hourly chart.

### Independent rendering

Today's data and baseline data fetch in parallel but **render independently**:

- Today's KPIs and chart bars render the moment today's data lands.
- Delta chips, baseline lines, grouped baseline bars fade in when their fetch completes.
- Don't block the whole UI on the slower fetch.

## Defaults &amp; Date Selection

- **Default date:** today's date in Pacific time, formatted `YYYY-MM-DD`. Reuse `pacificMidnightAsUTC` from `merchantos.js`.
- **Default comparison anchor:** vs 4-wk same-weekday avg.
- **Date picker:** native `<input type="date">` styled with the existing `.skylinks-input` look. No date range, single day only.
- **Comparison-anchor picker:** segmented control with 4 presets + Custom. Custom opens a second date input inline.
- **Refresh trigger:** changing the date *or* the anchor *or* clicking Refresh re-runs the affected fetches. Cached datasets do not re-fetch (except today's, always). Re-render destroys old Chart.js instances first.
- **Disabled future dates:** set `max` attribute on the date input to today.

## Loading &amp; Error States

- On first load and on every refresh: show a **progress bar** (gold fill on light gray track), exactly like the existing `sp-progress` / `sp-bar` pattern in `snapshot_selectpi.js`. Increment as each dataset completes.
- **Independent loading per series:** today's data and baseline data load independently. Today's bars/numbers render first; baseline overlays fade in after.
- **Per-series failure banner:** if today's fetch fails, the dashboard shows a red banner and aborts. If only baseline fails, dashboard renders today's series + a softer warning chip in place of delta chips: "Comparison unavailable — baseline failed to load."
- **Auth failure:** if `Sale.json` returns 401 or redirects to login, alert the user and abort cleanly.
- **Pagination guard:** cap pagination at, say, 50 pages × 100 records = 5000 sales/day. Skylinks won't hit that on a normal day, but a runaway should be caught. Log a warning if hit.

## Style &amp; Branding

- **Card chrome:** Skylinks brand. Gold accent (`#eeb02b`), ink (`#262b2f`), Segoe UI body, Trebuchet MS headings. Match the visual language of `snapshot_selectpi.js`.
- **Inside charts:** **task-appropriate colors over Skylinks branding.**
    - Today series → Skylinks gold `#eeb02b` (solid).
    - Baseline series → neutral gray `#6b7280` (dashed line, striped bar pattern, or 60% opacity solid depending on chart type).
    - Department / payment-type categorical palette → distinct hues (teal, orange, purple, slate, amber, etc.) — avoid gold inside categorical charts so it stays unique to the today series.
    - Delta chips → green `#16a34a` (up), red `#dc2626` (down), gray `#9ca3af` (within ±2%).
- Buttons (close, refresh): match the existing `.btn` style in `popup.html`.
- All inline styles, consistent with the rest of the extension.

## Code Structure (suggested)

Keep `snapshot_merchantos.js` as a single IIFE, just like `snapshot_selectpi.js`. Suggested internal organization:

```jsx
(function MerchantOSSnapshotUI() {
	// 1. Auth check (cookie session)
	// 2. Build overlay DOM (innerHTML template)
	// 3. State: { date, anchor, customAnchorDate, cache: Map, charts: {...} }
	// 4. fetchSalesForDate(date) → paginated Sale.json fetch
	// 5. aggregate(sales) → { kpis, byHour, byDept, byPayment, items, discounts, refunds }
	// 6. compare(todayAgg, baselineAgg) → { deltaKpis, deltaByHour, ... }
	// 7. render(todayAgg, baselineAgg?) → updates KPIs, (re)creates Chart.js instances
	// 8. renderSparklines(weekdayHistory) → 14-bar mini charts
	// 9. evaluateExceptions(todayAgg, baselineAgg?) → flag chips
	// 10. destroyCharts() → call before re-render and on close
	// 11. Wire up: date change, anchor change, custom date input, refresh, close, backdrop
	// 12. Initial load with today's date + 4-wk avg anchor
})();
```

Reuse `window.SkylinksUtils.escHtml` and `window.SkylinksUtils.makeLogger('LS Snapshot')` to match existing logging conventions.

## Phasing

### v1 (snapshot launch)

- KPI cards with delta chips
- Hourly sales bar + baseline line
- Grouped department bar
- Discounts table
- Refunds &amp; voids table
- Exception strip (subset: discount $ flag, refund count flag, archived discount flag, gift card no-invoice flag)
- Comparison anchor picker with 3 presets: **Yesterday**, **Last Same-Weekday**, **4-wk Avg**
- Same-time clip for in-progress days

### v1.5

- Sparkline trend strip
- Stacked payment method comparison
- Winners &amp; Losers item lists
- Custom-date comparison anchor
- Full exception strip (all flags)

### v2

- vs Last Year anchor (needs ≥1y of historical data; live-fetched, slower)
- Same-time clip improvements (timezone / DST edge cases)
- Optional employee/cashier breakdown behind a toggle (off by default)

## Acceptance Criteria

- [ ]  Clicking the **Daily Snapshot Report** button on a Lightspeed Retail page opens an overlay within 200ms (before data loads).
- [ ]  Overlay defaults to today's date and the 4-wk same-weekday avg comparison anchor.
- [ ]  Today's KPIs and chart bars render as soon as today's `Sale.json` pagination completes, even if baseline is still loading.
- [ ]  Baseline overlays (delta chips, baseline lines, grouped baseline bars) appear when their fetch completes — no full-dashboard block on baseline.
- [ ]  All 4 KPI delta chips show the correct direction, percentage, baseline label, and baseline absolute value.
- [ ]  Switching the comparison anchor re-uses cached datasets (no re-fetch in DevTools Network tab) when the anchor's dates have already been loaded that session.
- [ ]  Hourly chart bars (today) and line (baseline) align on the same x-axis with correct hour labels.
- [ ]  In-progress days show "as of HH:MM" subtitle and clip baseline series to the same hour.
- [ ]  Department grouped bars show today + baseline side-by-side, sorted by today's $ by default.
- [ ]  Stacked payment bars (today + baseline) are normalized to 100% width and use the same categorical palette.
- [ ]  Winners &amp; Losers list filters out items with absolute delta &lt; 3 units AND &lt; $25.
- [ ]  Discounts table flags `[ARCHIVED]` discounts and tints `_X_memberships_*` rows.
- [ ]  Refund table shows positive empty state "No refunds today" when none exist.
- [ ]  Exception strip flags fire only when comparison thresholds are met; absolute-only checks (gift card no-invoice, house accounts) work without baseline.
- [ ]  Sparkline strip renders 14 bars per KPI with today's bar highlighted gold.
- [ ]  No-baseline-data state shows "— no comparison data —" in chips; doesn't render zeros as "−100%".
- [ ]  Closing the overlay (× button or backdrop click) removes it from the DOM and destroys all chart instances.
- [ ]  If session cookie is missing/expired, the same alert pattern as `merchantos.js` fires; no overlay opens.
- [ ]  Layout is legible at 1280×800 and remains usable down to 820px wide (single-column collapse).
- [ ]  Existing **Sales Lines Report** continues to work unchanged.

## Out of Scope (for v1)

- Multi-day report ranges or week comparisons (only single-day with one baseline anchor).
- Cashier/employee performance breakdown (sensitive — separate feature, future toggle).
- CSV export (existing Sales Lines Report covers this).
- Tax breakdowns.
- COGS / margin (would need item cost lookup).
- Inventory delta / receiving.
- Member-level customer drill-down.
- Mobile / extension popup view of the dashboard (overlay assumes desktop viewport).
- Saved presets, favorites, or scheduled refresh.
- Permission gating per user role.

## Open Questions

- **Department category source.** `SaleLine` has `Item.Category` and `Item.ItemAttributes` — confirm which field maps cleanly to the Skylinks Pro Shop / Range / F&amp;B / Lessons / Gift Cards / Other taxonomy, or whether a category-name-to-bucket lookup is needed.
- **Range Card identification.** Range Card payments may be a payment type *or* a specific gift-card-style SKU depending on configuration. Confirm before building the payment-type chart.
- **Pin Ticket vs Member Bucket** — same question. Both are partially documented; verify against a recent paid invoice with each.
- **Last Year fetch performance.** A full year-ago day's `Sale.json` fetch may be slow if Lightspeed's session/index favors recent data. May warrant explicit timeout + soft fail.
- **4-wk avg with closed days.** If one of the trailing 4 same-weekdays has zero sales (closed), should it be excluded from the average or included? Recommend excluding (with a note in the subtitle: "avg of 3 of last 4 Tuesdays — May 12 closed").
- **House account running balance.** Show today's deltas only, or include cumulative outstanding balance? Cumulative requires a second endpoint and is only worth it if staff actually need the running figure.
- **Cashier toggle in v2.** What permission model gates it? Just "don't show to non-admins" (client-side, weak) or actually permission-checked against Lightspeed's role data?
- **Sparkline backfill cost.** 13 historical fetches happen every session, even cached. Worth persisting in `chrome.storage.local` keyed by date? Trade off: persistence complicates cache invalidation (a re-completed sale yesterday would stale the cache).

}