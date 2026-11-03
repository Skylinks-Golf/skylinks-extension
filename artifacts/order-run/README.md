# Weekly Order Run

Weekly Pro Shop reorder worksheet: last week's sales, ideas (selling faster / check the shelf / consider cutting), and this week's order grouped by vendor and ordering method.

- **Owner:** LC Torres (lc@skylinksgolf.com)
- **Artifact:** [Pro Shop Order Run](https://claude.ai/artifact/A46JNVDxUR84mEGpHv8Ujq). Publish from `artifacts/order-run/index.html` to this same link.
- **Cadence:** Run weekly (Tuesday). Each run replaces the sales week, the pull date, the `DATA` blob and the localStorage `KEY`.

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
