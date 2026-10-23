# Stripe — Daily Successful Transactions Report

**Status (2026-10-01):** Building. Extension side done (uncommitted). Stripe App source written
and unit-tested; waiting on `stripe apps create` (Ian) before it lands in `apps/skylinks-stripe-app`.
**Requested by:** Sandy (accounting, Stripe role: Administrator) · **Owner:** Ian

## What it does

For one Pacific calendar day (default today): every **succeeded** Stripe charge with payment
date/time, customer first + last name, amount, and payout/deposit date — saved as a CSV for Excel.

## Architecture (decided)

```
Stripe Dashboard ── private Stripe App "Daily transactions" (apps/skylinks-stripe-app)
                     • public Stripe API as the signed-in user (no keys, no backend)
                     • builds + sorts rows, shows a preview table
                     • "Copy report for export" → CSV on the clipboard
                          │  Ctrl+V
                          ▼
Skylinks Tools ──── "Save Stripe Report" (content/stripe.js) on dashboard.stripe.com
                     • validates the header contract, previews rows + total
                     • downloads stripe_transactions_YYYY-MM-DD.csv (UTF-8 BOM for Excel)
                     • no network calls
```

Why not the alternatives: the browser-session pattern failed (dashboard auth lives in page
memory; we won't lift it — `docs/api_refs/stripe.md` §1). SWS-in-the-middle works but adds a
Cloud Function, Google-identity auth, and a managed key for one report. A Stripe App can't
download files (links are http(s)-only), hence the clipboard handoff to the extension.

## CSV contract (v2)

`Payment Date,Time (PT),First Name,Last Name,Amount,Net,Payout Date,Payout Status,Note,Stripe ID`

- Must match exactly in `skylinks-stripe-app/src/lib/report.ts` (`REPORT_HEADER`) and
  `content/stripe.js` (`EXPECTED_HEADER`). Change both together.
- Amount / Net: plain decimals (`67.00`). Dates: `YYYY-MM-DD`. CRLF line endings.
- v1 → v2 (2026-10-01): added Net.
- Payout Status: `Paid` (arrived) · `In transit` (Stripe's estimate) · `Estimated` (no payout
  yet — `available_on`) · `Unavailable`.
- Note: `Refunded`, `Partially refunded`, `Disputed`, `No name on file` (joined with `; `).

## Field mapping

| Column | Source |
|---|---|
| Payment Date / Time | `charge.created` → Pacific |
| First / Last Name | `billing_details.name` → else `customer.name`; split on last space |
| Amount | `charge.amount` (gross, before Stripe fees) |
| Net | `balance_transaction.net` = gross − Stripe fee at charge time. Refunds/dispute withdrawals are separate balance transactions and are **not** subtracted here; blank if Stripe has no balance txn |
| Payout Date | `payout.arrival_date` if the charge's balance txn is in an automatic payout, else `balance_transaction.available_on` |

## Next steps

1. **Ian:** from `C:\data\skylinks\apps`, run `stripe apps create skylinks-stripe-app` (accept the
   Stripe Apps Agreement yourself; pick the default template). Then tell Claude.
2. Claude: drop in `src/`, merge `stripe-app.partial.json` into `stripe-app.json`, pin `stripe@^18`,
   run tests.
3. Ian: `stripe apps start` → preview on Payments in **test mode**, then live. Verify against the
   dashboard: one payment's name, amount, and payout date (watch the UTC-date gotcha).
4. Reload the unpacked extension (v1.6), click **Save Stripe Report**, paste, open the CSV in Excel.
5. `stripe apps upload` → Dashboard › Apps → install **Private to your account** in live mode.
6. Walk Sandy through it once; commit both repos.

## Decisions (Ian, 2026-10-01)

- Refunded / disputed payments: **kept**, flagged in Note.
- Net column: **added** (see Field mapping for exactly what it means).

## Open question for Sandy

- No-name payments: currently **blank name + "No name on file"**. Use email instead?
