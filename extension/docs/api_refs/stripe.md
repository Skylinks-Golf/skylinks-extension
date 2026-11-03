# Stripe Dashboard — Browser-Session API (reverse-engineering findings)

**Status:** RE run 2026-10-01 (Ian + Claude in Chrome, Windows Chrome, live mode).
**Outcome: the browser-session pattern does not work for Stripe.** Run stopped early — see §1.

**Rules for this doc:** no secret values, no real customer data, no account IDs.

## 1. Environment & authentication — what we found

- Dashboard origin: `https://dashboard.stripe.com`. Pages are scoped by account in the URL
  (`/acct_…/payments`).
- The dashboard's own API calls are **same-origin**: `https://dashboard.stripe.com/v1/...`.
  Paths mirror the public API (e.g. `/v1/accounts/{id}`), and most calls send an
  `include_only[]` field list.
- The payments list isn't loaded from `/v1/charges`. It comes from an internal reporting
  endpoint, `GET /v1/reporting/execute_data_story?report_type=payins_dashboard.unified_payments.list_view&parameters[livemode]=true&parameters[limit]=20`.
- `window.fetch` and `XMLHttpRequest` are wrapped by the dashboard, and a service worker
  (`sw-stripe-2.js`) controls the page. Most `/v1/` data calls didn't show up in the page's
  own resource timing, so they likely go through a worker.
- **A plain cookie-authenticated request does not work.**
  `fetch('/v1/charges?limit=3', { credentials: 'include' })` (both the page's wrapped fetch
  and a native one) hung for 15–20 s and then returned **503**. Session cookies alone don't
  authenticate dashboard API calls.
- The dashboard authenticates its API calls with a session credential that lives in **page
  JavaScript memory**. That credential is not in a cookie a content script can read, or in
  localStorage.
- **Decision:** reading the dashboard's in-memory session credential and using it from our
  extension would mean handling a live Stripe credential outside Stripe's own code. We are
  **not** doing that. The automated test that tried it was blocked by a safety check, and
  we agree it's the wrong approach. Don't revisit it.

## 2–4. Payments list / detail / payouts

Not pursued — blocked by §1.

## 5. Edge cases

Not pursued.

## 6. Built-in export check

- An **Export** button exists on Transactions → Payments (next to "Create payment"), and it
  respects the active filters (e.g. Succeeded). Its column options weren't reviewed in this run.
- Worth checking by hand: whether the export (or a Reports → payout reconciliation report)
  already gives Sandy amount, date, customer name, and payout date for a single day.

## 7. Conclusion & next options

The "logged-in web app" pattern used for Deputy, Perfect Venue, and Lightspeed doesn't carry
over to Stripe. Options, in rough order of effort:

1. **Stripe's built-in export / reports.** No code. Check the columns first (§6).
2. **Private Stripe App (front-end only).** Officially supported. Calls the public API as
   the signed-in dashboard user, with no key and no backend. Lives inside the Stripe
   dashboard, not the Skylinks Tools extension.
3. **SWS Cloud Function + restricted read-only key in Secret Manager.** The extension calls
   SWS. Needs Google-identity auth (domain + allowlist check), CORS or a background service
   worker, and log scrubbing for customer names.

**Decision (2026-10-01):** option 2 — a private Stripe App builds the report, and the extension's
**Save Stripe Report** tool saves it as CSV via a clipboard handoff. Sandy is a Stripe
Administrator, so the app's user-scoped API calls have the access they need. Plan and contract:
`tasks/stripe_daily_transactions.md`.
