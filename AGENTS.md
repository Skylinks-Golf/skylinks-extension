# AGENTS.md — Skylinks Tools Extension

Agent-facing entry point for this repo. Read this first.

## What this is

Skylinks Tools is a Chrome MV3 browser extension used by Skylinks Golf pro-shop and admin staff. It adds report-generation and export buttons on top of vendor sites the shop already uses — Lightspeed/MerchantOS, Lightspeed Golf (Chronogolf), SelectPi (range-ball dispensing), Perfect Venue, and Deputy — so staff can pull CSV reports and snapshots without leaving those sites.

## Stack

- **Manifest V3**, no build step — plain JS files, no bundler, no transpilation.
- **Per-site content scripts** under `content/`, injected on demand via `chrome.scripting.executeScript` from the popup (not declared statically in the manifest).
- **Shared modules** under `content/core/` (modal, API client, CSV, dates, pagination, table rendering, etc.) plus `content/utils.js`, all attached to a single global namespace, `window.SkylinksUtils`.
- One vendored library: `content/vendor/chart.umd.min.js` (Chart.js UMD build, used by the snapshot reports).
- No package.json, no npm scripts, no test framework, no CI for this app.

## Structure

```
manifest.json           # MV3 manifest: permissions, host_permissions, popup action
popup.html / popup.js   # Toolbar popup — detects the active tab's site and lists matching tool buttons
content/
  utils.js              # Small shared helpers (escHtml, escCsv, makeLogger) — window.SkylinksUtils
  core/
    dates.js            # Date/timezone helpers — Pacific-time convention lives here (see Conventions)
    api.js               # apiClient() — fetch wrapper with auth strategies + retry
    csv.js               # Column-spec → CSV string / CSV section builders
    modal.js             # createModal() — the shared report UI overlay
    workflow.js           # runReport() — wires modal to validate→fetch→process→render
    paginate.js           # Offset / hasMore-style pagination helper
    table.js, download.js, copy.js, dom.js, theme.js, config.js, format.js, errors.js, preflight.js
  chronogolf.js          # Chronogolf: Import Customers + Export Tee Sheet tools
  merchantos.js           # Lightspeed/MerchantOS: Sales Lines Report
  snapshot_merchantos.js  # Lightspeed/MerchantOS: Daily Snapshot Report (uses chart.umd.min.js)
  selectpi.js             # SelectPi: Weekly Earnings Report
  snapshot_selectpi.js    # SelectPi: Daily Snapshot Report (uses chart.umd.min.js)
  perfectvenue.js         # Perfect Venue: Weekly Analytics Report
  deputy.js               # Deputy: Weekly Hours Report
  tee_sheet_export.js     # Chronogolf tee sheet CSV export
  vendor/chart.umd.min.js # Vendored Chart.js
icons/                   # Toolbar icons (16/24/32/48/128)
docs/                    # Vendor API references, walkthroughs, example exports
tasks/                   # Completed/in-flight task notes (project history, not app code)
```

## Key entry points

- `manifest.json:1` — MV3 manifest; `host_permissions` (lines 7–15) list every vendor domain this extension is allowed to run on. Adding a new vendor starts here.
- `popup.js:1` (`CORE_FILES`) and `popup.js:20` (`TOOLS`) — the routing table. `TOOLS` matches the active tab's URL to a vendor and injects `CORE_FILES` + that tool's file(s) via `chrome.scripting.executeScript` (`popup.js:31`). There is no manifest-declared `content_scripts` block — everything is injected on click.
- `content/utils.js:1` and `content/core/*.js` — the shared `window.SkylinksUtils` namespace every content script depends on.
- `docs/adding_a_new_tool.md` — the canonical, up-to-date walkthrough for wiring in a 7th vendor (content script boilerplate, `popup.js` registration, `manifest.json` host permission). Follow it exactly rather than improvising a new pattern.

## Development

There is no build step and no test suite for this app.

- **Install/build**: none — the extension runs directly from source files.
- **Load unpacked** (how staff/devs run it): open `chrome://extensions`, enable Developer mode, click "Load unpacked", select this `apps/skylinks-extension` folder. Reload the extension after editing any file to pick up changes.
- **Test**: none exists. Verify changes manually by loading unpacked and exercising the relevant tool button on the real (or a sandbox) vendor site.
- Repo-root workspace scripts (`npm run sle:*` at `C:\data\skylinks\package.json`) manage the overall Skylinks Local Ecosystem/submodules, not this app specifically.

## Conventions & gotchas

- **Timezone handling: always use `Intl`, never `getTimezoneOffset()`.** The established convention lives in `content/core/dates.js` — see `pacificMidnightUTC` (`content/core/dates.js:37`) and `pacificHour` (`content/core/dates.js:74`), both of which use `Intl.DateTimeFormat` with `timeZone: 'America/Los_Angeles'` to get the correct Pacific offset year-round, including on DST transition days. Do not reintroduce `Date.prototype.getTimezoneOffset()` — it reflects the *browser's* local timezone, not Pacific, and breaks for any staff member not physically on Pacific time.
- **Per-site isolation, shared core.** Each vendor gets its own `content/<vendor>.js` file; nothing vendor-specific belongs in `content/core/`. Shared behavior (modals, CSV, dates, API calls) goes in `content/core/*.js` and is consumed via `window.SkylinksUtils`, never re-implemented per tool.
- **No manifest-declared content scripts.** Scripts are injected imperatively from `popup.js` (`CORE_FILES` + the matched tool's `files`), not via `manifest.json`'s `content_scripts`. If a new file needs to run, it must be added to `popup.js`, not just to the `content/` folder.
- **`docs/adding_a_new_tool.md` is the source of truth** for the modal/API-client/CSV/report pipeline pattern (`createModal`, `apiClient`, `runReport`) — follow its boilerplate rather than hand-rolling a new tool's structure.

## Token-efficient exploration

A `code-review-graph` MCP server is configured for this repo (`.mcp.json`) — a local knowledge-graph tool for structural code navigation (semantic search, impact radius, caller/callee tracing, dead-code detection, execution-flow tracing). When it's connected and available, prefer it over raw Grep/Glob/Read for exploration, debugging, refactor-planning, and change-review tasks — it's typically faster and cheaper in tokens, and surfaces structural context (callers, dependents, test coverage) that plain file scanning won't. When it isn't available or doesn't cover what you need, fall back to normal Grep/Glob/Read without hesitation.

Four skills under `.claude/skills/` wrap this tool for common workflows:
- `debug-issue` — trace a bug via `semantic_search_nodes`, caller/callee tracing, and `detect_changes`.
- `explore-codebase` — get architecture/community overview before drilling into specifics.
- `refactor-safely` — preview renames and dead-code candidates before applying them.
- `review-changes` — risk-scored diff review plus impact radius and test-coverage checks.

## For AI agents working here

Org-wide rules for this repo owner's environment also apply — see the repo root `CLAUDE.md` at `C:\data\skylinks\CLAUDE.md`. (That file still carries some of the same legacy content described below and is being cleaned up separately — don't edit it as part of work in this app.)

See [KOADOS.md](KOADOS.md) for the (WIP) legacy agent-tooling framework this repo previously used.
