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
| SOUT | Southern Wine (Proof) | Built; tested 2026-11-17 | `https://shop.sgproof.com/sgws/en/usd/myLists/savedList/favLists_05619246` (Weekly Reorder List, 48 items) | Cards `div.p-4` with `Per Case`; item no. like `201010 •`; first `input[type=number]` = Cases; per-card **Add to Cart**. In-cart shows as a banner "You currently have N Cases" in the card's parent. Must scroll to load all cards. 16 items mapped. Unmapped: Flybird Tamarind Mango 250ml, Flybird Baja Lime (Lightspeed 24pk; list only has 750ml), Red Bull Watermelon, Red Bull Sea Blue (two list entries 614098/614099, ask LC), Freixenet Cordon Negro. |
| BRKT | Breakthru Bev | To build | `https://now.breakthrubev.com/my-account/favoritesDetail/8878406828733` ("Skylinks Weekly Reorder (Breakthru)", 21 products) | Each row has a "CSE(s)" box; ONE page-level **Add to Cart** adds every row with a quantity, so leave all other rows at 0. Site returned an "Internal Error" page on 2026-11-17 (probably an expired session). Product IDs: Almanac Love 9338023, Big Love 9704223, Seaside 9724138, Salty Crew Blonde 9706118, Dark Horse Rose Brut 9376341, Pinot Grigio 9310178, Sauv Blanc 9357373. Dark Horse Pinot Noir 375ml is not on the list. |
| MARK | Markstein (vtinfo) | To build | `https://apps.vtinfo.com/retailer-portal/00105/retailer/45580/my-items?listId=653` ("Weekly Reorder List") | Rows have - / + case buttons. Known: Cali Squeeze Blood Orange 33502, Stella 24pk 42230, Juicy Hoot 19.2oz 65800, Bucked Up 16oz (Rocket Pop 79001, White Gummy Deer 79003, Blood Raz 79005). |
| MUSC | Muscle Foods USA | To build | `https://shop.musclefoodsusa.com/wish` → "Skylinks Weekly Reorder" | Type qty per row, then ADD TO CART. Gym Weed 12/12oz: Watermelon 7620004, Tropical Punch 7620006. Gym Weed Mango Razz not sold. Bucked Up comes from Markstein. Site may be moving to a new portal. |
| SAMS | Sam's Club | To build | `https://www.samsclub.com/buy-it-again` | Consumer site with stored payment methods: never open or change payment. Strong bot detection; may need to stay manual. |

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
- Southern: Rodney Strong Sauvignon Blanc ×1, Red Bull Original ×1.
LC decides whether to keep or remove them.

## Next steps

1. Commit the current work on `dev-lc` when LC asks; she pushes from GitHub Desktop (Claude has no GitHub login).
2. LC reloads Skylinks Tools and runs GoldenBrands + SF Naturals + Southern from *This Week's Order*.
3. Build BRKT, MARK, MUSC, SAMS one at a time with LC signed in: inspect the list page, write `xxState` / `xxFill`,
   build the item map, add the host permission, test one item.
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
