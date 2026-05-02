# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Chrome Extension (Manifest v3)** for Skylinks Golf Club. It injects content scripts into specific business platforms to add reporting and data import features via modal overlays.

**No build system.** There is no package.json, bundler, TypeScript, or npm. All files are vanilla ES2015+ JavaScript served directly to Chrome. To develop: load the extension in Chrome via `chrome://extensions` → "Load unpacked" → select this directory. Reload after each change.

## Architecture

### Routing: `popup.js` → content scripts
`popup.js` checks the active tab URL and calls `chrome.scripting.executeScript()` to inject the matching content script. Each content script is self-contained and runs on the page the user is already on.

### Content script pattern
Each integration lives in `content/<platform>.js` and follows this structure:
1. Wrapped in a named IIFE (e.g., `(function MerchantOsUI() { ... })()`) to avoid global scope pollution.
2. Creates a fixed-position modal overlay on top of the existing page.
3. Fetches data from the platform's API using `credentials: 'include'` (relies on the user's existing browser session cookies).
4. Transforms data and either generates a CSV download or renders a Chart.js visualization.
5. Modal can be dismissed via close button or clicking the overlay background.

### Shared utilities: `content/utils.js`
Exposes `window.SkylinksUtils` with:
- `escHtml(str)` — HTML entity escaping
- `escCsv(val)` — CSV value escaping (handles quotes, commas, newlines)
- `makeLogger(prefix)` — Returns a console logger with a consistent prefix
- `TD`, `TH` — CSS string constants for table cell styles

### Platform integrations

| File | Platform | Auth method | API type |
|------|----------|-------------|----------|
| `content/merchantos.js` | Lightspeed Retail | Session cookie | REST (XML responses) |
| `content/chronogolf.js` | Lightspeed Golf | Session cookie | REST JSON |
| `content/selectpi.js` | SelectPi | Bearer token from localStorage | REST JSON |
| `content/snapshot_selectpi.js` | SelectPi | Bearer token from localStorage | REST JSON + Chart.js |
| `content/perfectvenue.js` | Perfect Venue | Session cookie | GraphQL |
| `content/deputy.js` | Deputy | Session cookie | REST JSON |

## Key Non-Obvious Patterns

### Timezone handling
Pacific Time (PDT/PST) is calculated manually. Scripts detect the current UTC offset and compute "Pacific midnight as UTC" for API date parameters. Do not use `new Date().toLocaleDateString()` or similar — timezone drift will corrupt date ranges.

### Lightspeed pagination
`merchantos.js` uses a `fetchAllPaged()` helper that loops through 100-record batches until results are exhausted. New Lightspeed endpoints should follow this pattern.

### Chronogolf club ID resolution
`chronogolf.js` reads the club ID from Angular's app state in `localStorage` first, falling back to parsing the URL hash. This works around a race condition where the Angular app may not have initialized yet.

### Chronogolf customer import rate limiting
Imports use `BATCH_SIZE = 3` with `BATCH_DELAY_MS = 500` between batches to avoid hitting API rate limits. Adjust cautiously.

### Chart.js instance management
`snapshot_selectpi.js` tracks active chart instances in `state.charts` and calls `.destroy()` on them before re-rendering. Skipping this causes canvas reuse errors.

### SelectPi auth token extraction
SelectPi scripts extract the Bearer token from `localStorage` on the portal page since no cookie-based auth is available. The token key may change — see `content/selectpi.js` for the current extraction logic.

### Deputy membership tier IDs
Deputy stores membership affiliation types as numeric IDs. `deputy.js` maintains a client-side name→ID mapping fetched from the Deputy API at runtime. If new membership tiers are added in Deputy, this mapping needs updating.

## Docs

`/docs/` contains API reference documentation and examples for the integrated platforms. Check these before exploring unfamiliar endpoints:
- `docs/api_refs/lightspeed_api_ref.md`
- `docs/api_refs/selectpi_api_ref.md`
- `docs/deputy.md`
- `docs/perfect_venue.md`
