# AGENTS.md — skylinks-extension

Chrome extension (Manifest V3) providing per-platform report/export tools for Skylinks admin staff (tee sheet, retail snapshot, Deputy, PerfectVenue, SelectPI, etc.). Injects content scripts into whitelisted platform tabs and drives them from `popup.html`/`popup.js`.

## Layout
- `manifest.json` — permissions, host permissions, popup wiring.
- `popup.js` — `TOOLS` array maps a tab's URL to which content scripts to inject.
- `content/core/*` — shared utilities (modal, apiClient, csv, download, table, dates, pagination, preflight). Don't duplicate these in a tool script.
- `content/<platform>.js` — one file per integration, using `window.SkylinksUtils`.
- `docs/adding_a_new_tool.md` — the canonical walkthrough for adding a new platform integration; read this before adding a 7th tool.
- `docs/*.md` — per-tool notes (deputy, perfect_venue, retail_snapshot_review, tee_sheet_export).
- `tasks/*.md` — working notes on specific report builds.

## Conventions
- Tool-specific constants (base URLs, auth) live in the tool's own `content/<platform>.js`, not in `content/core/`.
- New platform → new hostname added to `host_permissions` in `manifest.json` and a new entry in `popup.js`'s `TOOLS` array.
- No build step / bundler — files are loaded directly as MV3 content scripts, so keep them plain browser JS (no ESM imports across files; shared code goes through the `window.SkylinksUtils` namespace).

## Working here
- This is an internal tool for non-technical golf-course admin staff — see the org-level instructions in the root `CLAUDE.md`/`AGENTS.md` for audience, tone, and data-handling rules (Stripe last-four only, no PII beyond what's needed, etc.).
- It's a submodule of the SLE monorepo (`Skylinks-Golf/SLE`); this repo's own remote is `Skylinks-Golf/skylinks-extension`. Changes here don't auto-propagate to the parent repo's pinned submodule commit — that's a separate, deliberate step.
- Treat browser extension permissions changes (new `host_permissions`, new `permissions`) as review-worthy — they widen what the extension can touch on a user's browser.

## Agent identity / KoadOS
If you're running as **Clyde** or another KoadOS agent (Ian's personal agentic framework) and the Citadel is present on this machine, boot normally and you'll get expanded tooling (persistent memory, `koad map`, scoped filesystem MCP, etc.) — see the KoadOS docs for that setup. This file intentionally stays generic so any agent (Claude Code, Codex, etc.) without Citadel access can still work productively in this repo using standard tools.
