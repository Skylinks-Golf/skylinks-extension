# Proposal: fill vendor carts from the order run (SipMarket first)

**Status:** proposal, not built. **Requested by:** LC. **Date:** 2026-11-04.

## Problem

Approving the weekly order works, and the vendor tabs open, but once the tabs open nothing is added to the carts, so no orders get created. Every cart is still typed in by hand. With cart filling, the weekly order could be much more efficient.

Today the cart step depends on a Claude run started from the Order Run Artifact. That run doesn't stay alive while staff sign into each portal, and signing in can't wake it up, so carts stay empty.

## Proposal

Move cart filling into the extension so it runs locally with no Claude usage, starting with SipMarket (GoldenBrands):

1. "This Week's Order" gets a **Fill carts** button for portal vendors. It opens each vendor tab.
2. The extension checks each tab every 10 seconds until staff have signed in. It never types a password.
3. On SipMarket it opens **Orders > Order Lists**, finds each item by SKU, enters the approved case count in that row and presses that row's **Add to Cart**. It never presses **Add List to Cart**, checkout or submit.
4. Items with no saved SKU are listed as "needs your pick" instead of guessed.
5. It shows what went into the cart and stops on the cart page for staff to review and submit.

## Needs

- Host permission `https://www.sipmarket.com/*` (cart filling on SipMarket only).
- A Lightspeed item → SipMarket SKU map in `orders/config.js`, built from the account's Order List and past invoices.
- A per-portal content script under `content/`; other portals follow one at a time.

## Rules it keeps

- Fills carts only. Staff review and place every order; ordering decisions stay with Brandon (PROTOCOLS.md §3).
- No passwords, no credentials stored, nothing submitted or sent automatically.

## Questions for Ian

- OK to add the SipMarket host permission?
- Should the SKU map live in `orders/config.js` or its own file?
- Is a cart-fill tool fine under the "drafts only" rule, given it stops before checkout?
