# Dev Log — skylinks-extension

Running log of notable work sessions on this repo: what was done, why, and the
reasoning behind non-obvious calls. Newest entries at the top.

---

## 2026-10-01 — Stripe report: Stripe App + extension save tool

**Decision:** build the data side as a private Stripe App (public API as the signed-in
user, no keys/backend) and keep the extension for what the app can't do: save a CSV file.
Handoff is clipboard → paste box, validated against a fixed header contract.

**Extension changes (uncommitted):** `content/stripe.js` rewritten as "Save Stripe Report"
(paste → validate → preview → download, no network calls); `download.csvButton` gained an
opt-in `bom` flag for Excel; `manifest.json` adds `dashboard.stripe.com` + bumps to 1.6;
`popup.js` registers the button. Reverted the earlier `stripe` block in `core/config.js`
(no API base URL is needed any more).

**Follow-up (same day):** refunded/disputed rows stay in (flagged); added a Net column
(`balance_transaction.net`) — CSV contract bumped to v2 in both repos.

**Found in passing:** `core/dates.js` `pacificMidnightUTC` samples the offset at noon UTC,
so on the two DST-switch days it's an hour off (window starts 07:00Z instead of 08:00Z in
March, and vice versa in November). The Stripe App samples at 08:00Z instead. Not fixed
here — affects the Lightspeed/SelectPi/PV reports on those two days only.

---

## 2026-10-01 — Stripe daily transactions report (scaffold)

**Ask:** Sandy wants a one-day report of successful Stripe payments: amount, payment
date, customer first/last name, estimated payout/deposit date (default: today).

**Decision:** stay on the browser-session pattern (content script on the logged-in
`dashboard.stripe.com`) rather than the public Stripe API — consistency with the tools
Sandy already uses outweighs having a documented API.

**Done:** scaffolded `content/stripe.js` (modal, Pacific-day window, row/column spec,
fetch stubbed to throw), added a `stripe` block to `content/core/config.js`
(`apiBaseUrl: null`), left a commented-out `popup.js` entry, no manifest change yet.
Spec, open questions for Sandy, and the Claude in Chrome RE runbook live in
`tasks/stripe_daily_transactions.md`; findings template in `docs/api_refs/stripe.md`.

**Watch:** if the dashboard's API credential only lives in page JS memory, the
ISOLATED-world injection used everywhere else won't reach it — that would need
`world: 'MAIN'`, a new pattern here. Decide explicitly before building.

**RE run result (same day):** it does. Session cookies alone get a hung request and
then a 503 on `/v1/`. The dashboard authenticates with a session credential held in page
memory, and we decided not to lift it into the extension. The browser-session pattern is a
dead end for Stripe. Options are in `docs/api_refs/stripe.md` §7.

---

## 2026-09-18 — Retail customer type sync feature; git stale-checkout cleanup

**Trigger:** Ian reported the Lightspeed customer import feature "seems to have rolled
back" — player type updates that had been working no longer appeared to be there.

### Part 1 — Diagnosing the "rollback"

Traced it with git archaeology rather than re-implementing anything:

- The checked-out commit (`708cf0a`) predated two commits already sitting on
  `io/nightly` (`07388ae`, `063557c`) that added the actual fix — a full
  create-or-update flow for Chronogolf customer import, including treating player
  type as a separate "affiliation" write from the profile PUT (see
  `docs/api_refs/chronogolfcustomerapi.md` §3).
- Nothing was lost. `git checkout io/nightly` restored the working code immediately.
- **Root cause of the "can't push" follow-up**: same story, one level up. Both local
  `main` and local `io/nightly` were simply behind their remotes (`git log --branches
  --not --remotes` came back empty — zero local-only commits, so there was never
  anything to push or reconcile). Fast-forwarded both with `git merge --ff-only`
  (plain `git pull` fails here because `pull.rebase` is configured and the working
  tree had unrelated uncommitted changes).
- Confirmed `io/nightly` was already an ancestor of `main` (PR #6 had merged it), so
  the later "rebase io/nightly on main" ask was a no-op — fast-forwarded and pushed
  instead of rebasing nothing.
- Also flagged, then ruled out as a non-issue: root `CLAUDE.md` briefly carried a
  personal "KoadOS agent" identity file (fictional persona, a `source .../koad-
  functions.sh` boot step, a "no full file reads" rule). Initially treated with
  suspicion as a possible prompt injection; commit `6f516e3` on `main` confirmed it
  was Ian's own personal agent-framework config, since replaced with a generic
  `AGENTS.md`.

**Takeaway for next time:** if something in this repo looks rolled back or push
misbehaves, check `git fetch` + ahead/behind counts before assuming a conflict or lost
work. It has been a stale local checkout both times so far.

### Part 2 — Retail customer type sync (new feature)

**Ask:** customers with the correct Golf player type also need their Lightspeed
Retail profile's customer type set to match (e.g. "SGC - Home").

**Research** (docs/api_refs/lightspeed_retail_01.md, chronogolfcustomerapi.md,
sgc_topsheet_example.csv): Golf player type and Retail customer type are unrelated
fields on unrelated systems — no shared customer ID. Retail auto-creates a profile
whenever the Golf import creates one, but never copies the type over. Ian confirmed
**email is the intended join key** on staff's side, and that the feature should reuse
the same SGC Topsheet CSV that already drives the Golf import — no second file to
maintain, no live cross-origin call needed (content scripts can't fetch cross-origin
between chronogolf.com and merchantos.com anyway, so this had to be two independent
manual steps sharing one input file, not one live pipeline).

**Design decisions and why:**
- Matches by email against a preloaded map of all Retail customers (paginated,
  10-way parallel — same technique already benchmarked in
  `lightspeed_retail_01.md` for ~8k customers).
- Resolves CSV "Membership Tier" → Retail `customerTypeID` by name at runtime
  (trying `SGC - X`, `SGC: X`, bare `X`), not a hardcoded ID table — same reasoning
  as the Golf side: these are club config and get renamed/recreated seasonally.
- **Never creates** a Retail customer — a CSV row with no match is reported as
  "Not Found" for a human to check (either the Golf import hasn't run for that
  person yet, or the emails don't match), not silently skipped or auto-created.
- The Retail `Contact.Emails` shape wasn't documented anywhere in this repo, and no
  live browser session was available to verify it directly, so
  `extractContactEmail()` was written defensively (handles array/object/bare-string
  variants) with a hard guard: if it extracts zero emails from a non-empty customer
  list, the tool refuses to run rather than quietly treating every row as
  "not found."
- Retail's customer type update is a **partial PUT** (`{customerTypeID}` only) —
  simpler and lower-risk than the Golf side's full read-modify-write requirement,
  confirmed safe to do this way per `lightspeed_retail_01.md`.

**Result:** built `content/merchantos_customer_type_sync.js`
("Sync Customer Type" tool, registered on `us.merchantos.com` in `popup.js`), no
manifest changes needed (host permission already existed). Ian live-tested it against
real member records on 2026-09-18 and confirmed it worked end-to-end, including the
previously-unverified `Contact` email shape. Documented in
`docs/api_refs/lightspeed_retail_customer_type_sync.md`.

Committed to `io/nightly` (`1057dbd`), pushed, and opened
[PR #7](https://github.com/Skylinks-Golf/skylinks-extension/pull/7) into `main`.
