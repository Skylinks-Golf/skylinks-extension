# Handoff: vendor portal cart fill (Skylinks Tools extension)

**Owner:** LC Torres. **Written:** 2026-11-17, from a Cowork session, for a Claude Code session to pick up.
**Read first:** `AGENTS.md`, `PROTOCOLS.md`, `extension/docs/sipmarket_cart_fill.md`. Their rules win over this file.

## Goal

When staff press **Open vendor tabs & emails** on the extension's *This Week's Order* page (`extension/orders/`), the
extension opens each checked order-online vendor, waits for staff to sign in, and fills the cart with the approved case
counts. It stops at the cart. Staff review and submit. No Claude usage at run time. Email vendors keep getting Gmail
compose windows (unchanged).

## Where things are

- **Branch:** `dev-lc`, up to date with `origin/main` (merged 2026-11-17). Per PROTOCOLS §1, LC builds this feature on
  `dev-lc` and opens one PR to `main` when it is complete.
- **Uncommitted work on `dev-lc`** (nothing pushed yet):
  - `extension/orders/sipmarket.js` (new): SipMarket SKU map (`SIPMARKET.SKU`, 48 items) + `smState` / `smFill`.
  - `extension/orders/portals.js` (new): the shared framework + SF Naturals + Southern modules + `PORTALS` registry.
  - `extension/orders/app.js`: `go()` now calls `fillPortal(v)` for every checked vendor that has a `PORTALS` entry;
    other portal vendors just get a tab. `fillPortal` replaces the old `fillSipMarket`.
  - `extension/orders/app.html`: loads `sipmarket.js` then `portals.js` before `app.js`; `.pmsg` style; button note.
  - `extension/manifest.json`: host permissions for `www.sipmarket.com`, `sfnaturals.pepr.app`, `shop.sgproof.com`.
- Repo checks pass (`node scripts/check-repo.js`). Not yet done: version bump + `CHANGELOG.md` line, AGENTS.md note,
  updating `extension/docs/sipmarket_cart_fill.md` (it describes SipMarket only).
- Separate branch `lc/order-run-sync` (committed, not pushed): syncs `artifacts/order-run/` with the live Order Run
  Artifact. Unrelated to this feature; LC will publish it.

## How the framework works (`orders/portals.js`)

Each `PORTALS[code]` entry (code = vendor code from `orders/config.js`):

| Field | Meaning |
|---|---|
| `name`, `site` | Shown in status lines |
| `start` | URL opened in a new tab (the vendor's saved list / order guide) |
| `sku(lightspeedName)` | Returns the portal item id, or null → reported "needs your pick" (never guessed) |
| `state()` | Injected; returns `{state:'signin'|'list'|'loading'|'other'|...}` |
| `relist(state)` | URL to navigate to when signed in but on the wrong page, else null |
| `fill(lines)` | Injected; `lines=[{item,cases,sku}]`; returns `{added:[[item,cases,id]], skipped:[[item,reason]], total?}` |
| `note(result)` | Optional extra text (SF Naturals: under the $350 minimum) |

`fillPortal` (app.js) opens the tab, polls `state` every 10 s for up to 45 min, runs `fill` once `state==='list'`, and
writes one status line per vendor into `#pm-<code>` under the button. Injected functions must be self-contained (no
closures) because they run via `chrome.scripting.executeScript({func,args})`.

`portalKey()` normalizes Lightspeed names: drops a type prefix (`Beer - `, `Seltzer - `…), ` - Single…`, and a trailing
` - 12pk`. Maps are written with the short Lightspeed names (e.g. `Coors Light - Lager - 16oz`).

Shared rules every module follows: only rows on the vendor's saved list; skip an item already in the cart; skip out of
stock; set quantity on that one row and press that row's add button; never "Add list to cart", checkout, submit, logins,
account/payment/delivery settings, or creating/editing saved lists.

## Portal status

| Code | Vendor | Status | Page used | Notes |
|---|---|---|---|---|
| GOLD | GoldenBrands (SipMarket) | Built; 1-item test passed 2026-11-10 | `https://www.sipmarket.com/en/orders/my-order-list/` | Rows `div.card.newCard.product[data-sku]`; `+` is `.qs__btn--add-v2`; add is `button.js--add-to-cart`. `data-units-in-cart` does NOT update after an add, so confirmation uses `.po__subtotal-value` / `.cart__counter`. Notion scope: Order List and Dashboard pages only. 6 items deliberately unmapped (Truly Wild Berry 12oz, Ranch Water, Buzz Ball Chocolate, Heineken Silver, Voodoo Fruit Juice IPA, Numb & Number). Coors Banquet mapped to the 15-pack while Lightspeed assumes 18: confirm with LC. |
| SFNA | SF Naturals (pepr) | Built; tested 2026-11-17 | `https://sfnaturals.pepr.app/` Order Guide | React Native Web, obfuscated classes. Search box `input[placeholder="Search Order Guide"]` (set via native value setter + `input` + Enter). Row = ancestor of `button[aria-label="Increase quantity"]` whose text has `Case • <code>`; qty in that row's text `input`. One `+` press = one case. $350 delivery minimum. 58 items mapped. Unmapped: Pure Leaf Sweet Tea, Pure Leaf Raspberry, Arizona Green Tea, Arizona Tropical ChillZicle. Takis Fuego is a 20-count case there (Lightspeed says 24). |
| SOUT | Southern Wine (Proof) | Built; rebuilt and tested 2026-11-17 (the first version was lost before commit) | `https://shop.sgproof.com/sgws/en/usd/myLists/savedList/favLists_05619246` (Weekly Reorder List, 48 items) | Cards `div.p-4` with `Per Case`; item no. like `201010 •`; first `input[type=number]` = Cases; per-card **Add to Cart**. In-cart shows as "You currently have N Cases" in the card's parent. Must scroll to load all cards. 16 items mapped. Unmapped: Red Bull Watermelon, Flybird Tamarind Mango, Freixenet (not on the list); Flybird Baja Lime (Lightspeed 24pk, list has 750ml only); Red Bull Sea Blue (614098 out of stock, 614099 available: LC to pick). |
| BRKT | Breakthru Bev | Built; 1-item test passed 2026-11-17 | Quick Order `https://now.breakthrubev.com/bulkAdd`; list `favoritesDetail/8878406828733` read only | Adding from the list page pops "Save List?" (the list is unsaved and would be deleted), so the fill uses Quick Order: type Product ID, pick the autocomplete row, set its CSE box, page-level **Add to Cart** (submits and loads `/cart`, so `brFill` returns `pending` and `brVerify` confirms on the cart). The list is fetched to check each item is on it and in stock; the cart page is fetched with product carousels removed to check in-cart. 20 items mapped. Unmapped: Salty Crew Blonde (Lightspeed 16oz, list 19.2oz), Dark Horse Pinot Noir 375ml (not on list), Pathfinder NA. |
| MARK | Markstein (VIP Retailer Portal) | Built; 1-item test passed 2026-11-17 | `https://apps.vtinfo.com/retailer-portal/00105/retailer/45580/my-items?listId=653` (Weekly Reorder List, 63 items) | Angular Material. Rows `mat-list-item` with `(<item no>)`; each **+** in `item-place-order` puts one case straight into the cart and the row button turns to **Update Cart** (used as the in-cart signal). Never press the row's **delete** (removes from list). Units per Case counts packs (2 x 12-pack = Lightspeed 24). 38 items mapped. Unmapped: Golden State Radical Pineapple (list has Radical Paradise). Firestone 805 24oz mapped to loose cans 52824, not the 3-pack 52823. Bucked Up (79001/79003/79005/79002) is on this list but filed under Muscle Foods in Lightspeed. |
| MUSC | Muscle Foods USA | Built; 1-item test passed 2026-11-17 | `https://shop.musclefoodsusa.com/wish` → "Skylinks Weekly Reorder" (state() clicks it open) | Angular. Box `input[name=Reorder]` per row; page **ADD TO CART**; confirmed by "CS of item <no> has been added to your cart". The cart page renders client-side, so `muFill` reads `/viewcart` in a hidden iframe for in-cart; if it can't and the header total isn't $0.00 it adds nothing. 2 items mapped (Gym Weed Watermelon 7620004, Tropical Punch 7620006). Gym Weed Mango Razz not sold. Bucked Up lines need moving to Markstein in Lightspeed. |
| SAMS | Sam's Club | Not built (manual tab) | `https://www.samsclub.com/buy-it-again` | Consumer site with stored payment methods and strong bot detection. Left as a plain tab for staff to fill by hand. Never open or change payment. |

Lightspeed items per vendor (with case sizes) are in the order data; `orders/app.js` `compute()` builds them each run.
To build a map: open the vendor's saved list while LC is signed in, read every row's id + name + pack, and match only
when product, size and units per case agree.

## Permissions (Notion, read before any real-cart write)

- **Agent Permissions** (`collection://13be81ca-c300-4988-8cbb-51046e0e5029`): "LC — ordering module vendor portals,
  edit live", Active, granted by Ian 2026-11-10. Scope: add approved items from sources marked Active in Ordering
  Sources to the cart by SKU; stop at the cart.
- **Ordering Sources** (`collection://6d7dce90-8c04-4c37-86aa-3adc5bada745`): all seven sources Active, Approved by Ian
  2026-11-16, with per-source Notes (SipMarket pages only; Sam's Club never touch payment). Ian's notes say technical
  host access and tests are still to be verified per source.
- Testing on a real cart: one item first, tell LC what was added so she can remove it.

## Test items currently in LC's real carts (from 2026-11-16/17 tests)

- SF Naturals: Gatorade Strawberry 28oz ×1, Takis Fuego ×1, Gatorade Zero Cool Blue 20oz ×1, Gatorade Cool Blue 28oz ×1.
- Southern: Rodney Strong Sauvignon Blanc ×1, Red Bull Original ×1, Red Bull Sugarfree ×1 (2026-11-17).
- Breakthru: Almanac Love IPA ×1 (2026-11-17).
- Markstein: Michelob Ultra 12pk ×1 case (2026-11-17).
- Muscle Foods: Gym Weed Watermelon ×1 case (2026-11-17).
LC decides whether to keep or remove them.

## Next steps

1. Commit the current work on `dev-lc` when LC asks; she pushes from GitHub Desktop (Claude has no GitHub login).
2. LC reloads Skylinks Tools and runs GoldenBrands + SF Naturals + Southern from *This Week's Order*.
3. Done 2026-11-17: BRKT, SOUT (rebuilt), MARK, MUSC built and 1-item tested. SAMS left manual. Still to do: LC runs all six
   from *This Week's Order* in the extension (nobody has run the full flow from the extension yet).
4. Then: version bump, CHANGELOG, AGENTS.md (mention `orders/portals.js`), update `sipmarket_cart_fill.md`, PR
   `dev-lc` → `main` listing permissions added and what each test showed.

## Gotchas learned

- **Lightspeed reports changed (Nov 2026):** rows are JSON in `pannel.listing_row_values`; the visible table has no cost
  columns. `orders/app.js` readers already parse it.
- **Pop-ups:** a web page can open only one tab per click. The extension uses `chrome.tabs.create`, which has no such limit.
- **The Claude scheduled task "Fill Pro Shop Vendor Carts"** (behind the Order Run Artifact's *Fill my carts* button)
  cannot reach Chrome (no Claude in Chrome connection), so it never fills carts. That is why this is moving into the
  extension. The Order Run Artifact still makes Gmail drafts through it.
- **Git from the Cowork bridge** leaves `.git/*.lock` files when deletes aren't allowed; check for stale locks if git
  says "File exists".
- Vendor rep business contacts in `orders/config.js` are approved (Ian, 2026-11-04). Don't add other contacts.
