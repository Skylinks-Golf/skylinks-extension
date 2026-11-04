# Proposal: fill vendor carts from the order run (SipMarket first)

**Status:** approved by Ian, being built on `dev-lc`, not on `main` yet. **Requested by:** LC. **Date:** 2026-11-04.

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

## Decisions (Ian, 2026-11-04)

- **Host permission:** yes, `https://www.sipmarket.com/*` only, added as part of the build.
- **SKU map:** its own file under `orders/`, not `orders/config.js`. It holds SKUs and item names only, with no prices or invoice details, because this repo is public.
- **"Drafts only" rule:** fine, because it stops before checkout. It writes to a live vendor site, so it shows the items and quantities first, gets confirmation from the person running it, and is tested with one item before a full order. Emptying the cart is the undo.

LC can build this without checking in. Testing against the real cart needs an Active row in the Agent Permissions registry, which only Ian can add. See `PROTOCOLS.md` section 1 for the limits. Other portals come after this one is merged.
