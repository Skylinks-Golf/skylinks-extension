# Pro Shop Orders (extension page)

Weekly order run, last week's sales, money (profit and leaks) and add/cut/swap ideas, built from Lightspeed Retail. It is the extension version of the [Weekly Order Run](../../artifacts/order-run/README.md) Artifact.

- **Owner:** LC Torres (lc@skylinksgolf.com)
- **Open it:** Skylinks Tools toolbar popup → **Pro Shop Orders** buttons (shown on every site). Each opens `orders/app.html#<tab>` in a new tab.
- **Read only.** Nothing is ordered, emailed or changed in Lightspeed. "Open vendor tabs & emails" opens portals and pre-filled Gmail compose windows; staff sign in, review and press Submit/Send themselves. Staff may ask Claude to add items to a vendor cart (Brandon agreed, per Ian, 2026-11-04); a person still reviews and submits.

## How it differs from the other tools

The other tools are content scripts injected into a vendor page with a modal. This one is a full extension page (`orders/app.html`) because it has four tabs, charts and an order editor. It still reads Lightspeed through the signed-in session: `app.js` finds or opens a `us.merchantos.com` tab and runs small self-contained reader functions there with `chrome.scripting.executeScript({func})`.

## Files

| File | What it holds |
|---|---|
| `app.html` | Page layout and styles (house style: black header, gold rule, Montserrat) |
| `app.js` | Lightspeed readers, order math, rendering |
| `config.js` | Vendor table `V` (ordering method, rep, business email, portal, cadence), cover weeks, case-size rules |

## Data

- Report endpoints: item sales by vendor (`reports.sales.listings.item`), sales by category, discounts, inventory assets, box (case) items.
- **Lightspeed changed its report pages (Nov 2026):** rows now come as JSON in `pannel.listing_row_values`, and the visible table no longer has cost columns. The readers parse that JSON and page through `listing.page_count`. If Lightspeed changes it again, the page shows "No data" instead of zeros.
- Pulls are cached per week in `chrome.storage.local` under `run2-<weekEnd>`. "Refresh from Lightspeed" re-pulls.
- Needs the `storage` permission and the existing `us.merchantos.com` host permission.

## Order math

- Pace = 4-week units ÷ 4. Par = pace × cover weeks (portals 1.5, breweries 2.5, merch 4).
- Cases = what it takes to get back to par, rounded up to whole cases, capped at about 4 weeks of sales (1 case always allowed).
- Negative stock in Lightspeed → replace what sold last week instead of filling to par.

## Known follow-ups

- Confirm "(guess)" delivery cadences with reps.
