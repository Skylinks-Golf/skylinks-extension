# PO Intake (replaced)

**Replaced by the 6 · Receive invoices tab on the [Pro Shop Order Run](https://claude.ai/artifact/A46JNVDxUR84mEGpHv8Ujq)** (`artifacts/order-run/`). This page stays live until the tab is proven and the invoices saved here have been processed; retiring it needs LC to type "approve". `items.json` here is still the item list the Order Run publishes.


Staff drop or scan a vendor invoice (photos or PDF), Claude reads it, they check the fields and match each line to a Lightspeed item, then Save. The scan is filed to Drive as one PDF and the invoice joins a queue. The queue worker (skill `.claude/skills/skylinks-po-queue/`) enters queued invoices as Lightspeed purchase orders when someone asks.

- **Owner:** LC Torres
- **Artifact:** [Skylinks PO Intake](https://claude.ai/artifact/QhJRWAtFKgCcLYMKz6jvhT). Publish from `artifacts/po-intake/index.html` (and `items.json`) to this same link.
- **Capabilities:** `db`, `user`, `assets`, `sample` (images), `mcp` → Google Drive `create_file`.

## Files

- `index.html`: the page.
- `items.json`: Lightspeed item list used for matching. Rows are `[itemID, description, isBox(0/1), componentItemID?, componentQty?]`. About 2,000 items; excludes Green Fees, Rentals, Memberships, Golf, Instruction, Range Balls, Gift Cards, Punch Cards, Raincheck, MISC. Refresh it from the Lightspeed Item API when items change. No prices or stock.

## Data (artifact database, not in the repo)

- `pos/<receivedDate>_<vendor-slug>_<invoice-slug>`: one doc per invoice (vendor, invoice #, dates, lines with matched item, charges, calculated totals, Drive link, PO note, status, log).
- `status`: `ready` → `filed` → `entered` → `checked_in` → `broken_down`. `hold` = reason it stopped.
- `lookup/<vendor-slug>__<code-or-desc-slug>`: remembered line → item matches.
- Scans go to the Food & Beverage shared drive, Purchase Orders folder, named `YYYY-MM-DD - Vendor - Inv <number>.pdf`. The folder ID is in `index.html`; the folder is access-controlled.

## Rules

- Invoices and scans stay in the database and Drive, never in the repo.
- If the Lightspeed total doesn't match the invoice total, stop and flag. Never enter wrong numbers.

## Known follow-ups

- `index.html` is a full HTML document and loads pdf.js and jsPDF from cdnjs. That differs from `artifacts/README.md` (body only, everything inline). Bring it in line, or record the exception, in a later change.
- The Lightspeed API write path for creating POs is unverified; the worker uses the UI until it is.
- Share the page with Ian, Daniel and Brandon.
