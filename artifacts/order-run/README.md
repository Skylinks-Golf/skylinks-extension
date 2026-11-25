# Pro Shop Ordering & Receiving (was Weekly Order Run)

Weekly Pro Shop reorder worksheet: last week's sales, ideas (selling faster / check the shelf / consider cutting), and this week's order grouped by vendor and ordering method. Plus receiving: scan vendor invoices and queue them as Lightspeed POs (tab 6).

- **Owner:** LC Torres (lc@skylinksgolf.com)
- **Artifact:** [Pro Shop Ordering & Receiving](https://claude.ai/artifact/A46JNVDxUR84mEGpHv8Ujq). Publish from `artifacts/order-run/index.html` to this same link.
- **Cadence:** Run weekly (Tuesday). Each run replaces the sales week, the pull date, the `DATA` blob and the localStorage `KEY`.

## Tabs

1 · Last week's sales, 2 · Money, 3 · Ideas, 4 · Map, 5 · This week's order, **6 · Receive invoices**.

### 6 · Receive invoices

Moved here from the stand-alone PO Intake page (2026-11-25; page renamed from "Pro Shop Order Run" the same day) so all inventory work is in one place. Staff drop or scan a vendor invoice, Claude reads it and suggests the Lightspeed case item for each line, they check the numbers and Save. The scan is filed as one PDF in the Food & Beverage shared drive (Purchase Orders), and the invoice joins a queue. Saying "process the PO queue" to Claude runs the worker skill (`.claude/skills/skylinks-po-queue/`), which enters the PO in Lightspeed.

- **Files:** `index.html` plus `items.json`, the Lightspeed item list used for matching (`[itemID, description, isBox(0/1), componentItemID?, componentQty?]`, no prices or stock). It is kept in `artifacts/po-intake/items.json` and published with this page. Refresh it from the Lightspeed Item API when items change.
- **Database:** `invoices/<receivedDate>_<vendor-slug>_<invoice-slug>` (one doc per invoice; `status` ready → filed → entered → checked_in → broken_down, `hold` = why it stopped) and `invoiceMatches/<vendor-slug>__<code-or-desc-slug>` (remembered line → item matches). Invoices and scans stay in the database, the page's asset store and Drive, never in the repo.
- **Capabilities added for this tab:** `assets` (scan pages), `sample` with images (Claude reads the invoice and suggests matches), Google Drive `create_file` (files the scan). pdf.js and jsPDF load from cdnjs only when a PDF is added or a scan is filed.
- **Buttons:** in Queue, **Enter in Lightspeed** (opens Lightspeed to sign in, Claude creates the PO and checks the total, stops at Open) and **Check in & break down** (Claude checks in, breaks down cases, marks the PO Finished). They fire a per-person Claude Code Remote trigger, set up once per computer with **Set up on this computer**, the same way as Fill my carts. The trigger's prompt is `PO_PROMPT` in `index.html` (keep it in step with the worker skill; bump `PO_PROMPT_VERSION` when it changes). Trigger IDs are saved in `runners/<person>` as `poTriggerId`, `poPromptVersion`.
- **Rule:** if the Lightspeed total doesn't match the invoice total, stop and flag. Never enter wrong numbers.

## Data sources

- **Lightspeed Retail (R-Series), read only.** Gives 7-day and 4-week unit sales, stock on hand, case sizes and vendor per item.
- **Vendor table (`V` in the script).** Ordering method, rep first name, business email, portal URL and delivery cadence. Cadences marked "(guess)" still need confirming.

## How the numbers work

- **Pace:** average weekly units over the last 4 weeks.
- **Par:** pace × weeks until the next delivery, plus a cushion.
- **Cases:** what it takes to get back to par, rounded up to whole cases and capped at about 4 weeks of sales (1 case is always allowed).
- **Negative stock:** when Lightspeed shows negative stock, the order replaces last week's sales instead of filling to par.
- **Nothing is ordered or sent from the page.** Staff place orders. Quantity edits and Done checks are saved only in that browser.

## Data rules

- No card data, payroll or customer PII.
- Vendor rep business contacts are OK.
- No logins or portal passwords.

## Known follow-ups

- Confirm the "(guess)" delivery cadences with the reps.
- Items under "No vendor assigned" need a vendor set in Lightspeed.
- RepRally's contact is a personal Gmail address. Decide whether it belongs in a shared repo.
