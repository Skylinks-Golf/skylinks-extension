## What and why

## Checklist
- [ ] New `<initials>/<topic>` branch from current `main`; this PR targets `main`
- [ ] `node scripts/check-repo.js` passes
- [ ] No secrets, card data, payroll, or customer/member PII; no new third-party contacts (examples are synthetic)
- [ ] Loaded unpacked from `extension/` and tested the changed tool (say what you tested)
- [ ] If it writes to a live system: approval path followed, shows records and an undo plan
- [ ] Nothing is sent or placed automatically (drafts only); a person submits orders
- [ ] Logs say what happened (row numbers, counts), not names or contact details
- [ ] `manifest.json` version bumped and `extension/CHANGELOG.md` updated (if user-visible)
- [ ] `AGENTS.md` / docs updated (if structure or conventions changed)
