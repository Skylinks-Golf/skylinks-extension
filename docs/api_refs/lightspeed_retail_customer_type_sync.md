# Lightspeed Retail — Customer Type Sync (extension feature)

Built 2026-09-17, live-tested against real member records by Ian on 2026-09-18 and
confirmed working end-to-end (matches found, correct rows updated). Builds on the
transport basics in `lightspeed_retail_01.md` — this doc covers what's specific to the
sync feature itself.

## Why this exists

Lightspeed Golf (Chronogolf) and Lightspeed Retail (merchantos) are separate systems
with no shared customer ID:

- **Golf player type** = a Chronogolf affiliation (`affiliation_type_id`), e.g. "SGC: Home".
  Set by the "Import Customers" tool (`content/chronogolf.js`).
- **Retail customer type** = `Customer.customerTypeID`, a separate resource
  (`CustomerType.json`), e.g. "SGC - Home" — note Retail uses a dash where Golf uses a colon.
- Retail auto-creates a customer profile whenever a Golf profile is created, but does
  **not** carry the player type over — that's the gap this feature closes.
- The only reliable join key across the two systems is **email**.

## Flow

Both the Golf import and the Retail sync are driven from the same SGC Topsheet CSV
(`docs/sgc_topsheet_example.csv`: Email, Membership Tier, …), run as two separate manual
steps (Golf import first, then Retail sync) — content scripts can't call cross-origin
from one tab to the other, so there's no way to chain them into a single live operation.

```
1. GET  /API/Account/{id}/CustomerType.json                          → resolve tier name → customerTypeID
2. GET  /API/Account/{id}/Customer.json?load_relations=["Contact"]   → paginated, 10-way parallel (~8k customers)
     → index by Contact email → { customerID, customerTypeID }
3. for each CSV row:
     match by email (case-insensitive) against the index
     if no match: report "Not Found" (don't create — Lightspeed already should have)
     if customerTypeID already correct: skip
     else: PUT /API/Account/{id}/Customer/{id}.json { customerTypeID }   ← partial patch, no full round-trip needed
```

Implementation: `content/merchantos_customer_type_sync.js`, registered as "Sync Customer
Type" on `us.merchantos.com` in `popup.js`.

## Tier name resolution

Same pattern as Golf's affiliation-type lookup, tried in order against
`CustomerType.json`'s live names:

1. exact tier name (e.g. `"home"`)
2. `sgc - {tier}` (Retail's observed convention, e.g. `"sgc - home"`)
3. `sgc: {tier}` / `sgc {tier}` (fallbacks in case naming drifts)

Resolve by name at runtime, not from a hardcoded table — same reasoning as
`chronogolfcustomerapi.md`: these are club config and get renamed/recreated seasonally.

## Contact → email extraction

`lightspeed_retail_01.md` confirmed contact info lives under `Customer.Contact` but
never pinned down the exact email field shape. `extractContactEmail()` handles it
defensively:

```js
const raw = contact.Emails?.ContactEmail ?? contact.Emails ?? contact.email;
```

then normalizes single-object-vs-array (`dom.toArr`), preferring a `useType: "Primary"`
entry, and reads `.address` (or a bare string). **Confirmed working in the 2026-09-18
test run** — real customers were matched and updated — but which exact branch of that
fallback chain fired wasn't independently logged, so if a future account/API version
returns a shape none of these branches handle, `existingByEmail` will come back `false`
(see the "refuses to run blind" guard below) rather than silently matching nothing.

## Safety guards

- **Never creates a Retail customer** — only updates `customerTypeID` on a match. A
  "Not Found" result means either the Golf import wasn't run for that person yet, or
  their Retail email doesn't match the CSV — both need a human look, not a create.
- **Refuses to run if the email index comes back empty** against a non-empty customer
  list (i.e. the `Contact` shape assumption turned out wrong) — surfaced as a preflight
  error rather than quietly treating every row as "not found."
- Skips rows where the type is already correct (no-op write avoided).
