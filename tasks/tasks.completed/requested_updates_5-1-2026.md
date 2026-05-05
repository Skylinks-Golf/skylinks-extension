#### May 2, 2026 → Requested changes from Sandy


Our accountant, Sandy, has noticed some changes in Lightspeeds discounts and that the Sales Lines Report feature returned unuseful data. 

Diagnosis: Root Cause of Unknown (ID:116)
The extension's discount lookup is excluding archived discounts, but discount ID 116 is archived.
Here's the full picture:

What the extension does
The log shows:

[LS Report] Loaded 33 discount(s), 44 category/categories.

When I queried the Lightspeed API directly, the extension is fetching discounts with archived=false:
/API/Account/305872/Discount.json?limit=100&archived=false
This returns 33 discounts — which matches the log exactly.

What discount 116 actually is
Querying the API directly for ID 116:
json{
  "discountID": "116",
  "name": "Skylinks Membership Bucket",
  "discountPercent": "1",
  "archived": "true",
  "createTime": "2026-04-15T16:56:10+00:00",
  "timeStamp": "2026-05-01T20:47:52+00:00"
}
Discount 116 is "Skylinks Membership Bucket" — it exists, but it was archived. It was created on April 15 and archived on May 1 (yesterday). Because the extension only fetches non-archived discounts, it has no name for ID 116 in its lookup map, and falls back to Unknown (ID:116).

Why it's on 17 sale lines
The discount was archived on May 1, 2026 — the same day as the report run. Sales earlier that day would have used it while it was still active. After it was archived, it disappeared from the discount list but the sale records still reference its ID.

The Fix
The extension's discount fetch should also include archived discounts so that historical sales referencing retired discounts can still be resolved. The simplest change would be to remove the archived=false filter (or add a second fetch for archived=true):
/API/Account/305872/Discount.json?limit=100
This would return all 34+ discounts (including archived ones) and the name "Skylinks Membership Bucket" would correctly appear in the report instead of Unknown (ID:116).
Archived discounts should have `[ARCHIVED]` appened to the end of their name: "Skylinks Membership Bucket [ARCHIVED]"


---

Sandy has also requested a couple of changes in how payment types are renamed in the report for certain discounts.

Pseudo-code for requested changes.

```python
if line_total == 0 && item_name.includes("VIP Voucher"):
	payment_type = "VIP Voucher"

if line_total == 0 && (discount_name == "Beer Bucket Discount 5x$20" || discount_name == "Shooter w/Bucket Discount"):
	payment_type = "Marketing"

if discount_name == "_X_Owner Approved - Security" || discount_name == "_X_Owner Approved - DJ":
	payment_type = "DJ Comps"
	
if discount_name == "Owner Comp":
	payment_type = "Owner Comp"

```