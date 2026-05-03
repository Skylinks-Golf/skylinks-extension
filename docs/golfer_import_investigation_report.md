Chronogolf Customer Import — API Behavior Report
Compiled from live dev tools inspection on Club ID 2534 (Skylinks at Buchanan Fields), May 3, 2026

Critical Bug Found: Missing customer Wrapper in POST Body
This is the root cause of import failures.
The buildPayload() function constructs a flat JSON object (e.g. { club_id: 2534, first_name: "...", ... }) and posts it directly. The API rejects this with HTTP 400:
json{
  "error": { "message": "Bad Request: param is missing or the value is empty: customer" },
  "errors": [{ "type": "validation_error", "message": "Bad Request: param is missing or the value is empty: customer" }]
}
The payload must be wrapped in a customer key:
json{ "customer": { "club_id": 2534, "first_name": "...", ... } }
Once wrapped, the API proceeds to field-level validation (HTTP 422 with proper error messages). The fix in buildPayload() is simply:
jsreturn { customer: { club_id: ..., first_name: ..., ... } };

Authentication / CSRF

Only X-CSRF-Token is required. The Angular injector token (angular.element(document.body).injector().get('$http').defaults.headers.common['X-CSRF-Token']) is present and 86 characters long. This is the authoritative source.
X-XSRF-TOKEN is not needed. No XSRF-TOKEN cookie exists in the session. Sending it doesn't break requests (it's ignored), but it's dead code.
No meta[name="csrf-token"] tag exists on this SPA — the script's fallback to that tag always returns empty string. The cookie fallback also always fails (no XSRF-TOKEN cookie). The Angular injector is the only working CSRF source.
Session authentication uses credentials: 'include' (cookie-based). Cookie names present: standard analytics/Stripe/Intercom cookies — no XSRF-TOKEN.


Endpoint Reference
ActionMethodURLCreate customerPOST/private_api/clubs/{club_id}/customersGet customerGET/private_api/clubs/{club_id}/customers/{id}List customersGET/private_api/clubs/{club_id}/customers?page={n}&per_page=100Affiliation typesGET/private_api/organizations/{club_id}/affiliation_typesSession userGET/private_api/session/user

Successful Customer Record (Test Customer_092, ID #20128509)
Created at 2026-05-03T16:11:45.611-04:00. Full response shape from GET /private_api/clubs/2534/customers/20128509:
json{
  "id": 20128509,
  "activation_state": "pending",
  "email": "customer092@skylinksgolf.com",
  "first_name": "Test",
  "last_name": "Customer_092",
  "phone": "925925892584",
  "ref": "8V0D-6A0K",
  "gender": 1,
  "date_of_birth": null,
  "uuid": "2a5f6c2e-6b3e-4e51-b50a-52685431b17f",
  "affiliation_type_id": 150776,
  "affiliation_type_ids": [150776],
  "member_no": null,
  "bag_number": null,
  "club_id": 2534,
  "created_at": "2026-05-03T16:11:45.611-04:00",
  "address": {
    "address_one": "1091 Concord Ave",
    "address_two": null,
    "country_code": "US",
    "state_code": "CA",
    "city": "CONCORD",
    "postcode": "94520"
  },
  "current_affiliation": {
    "id": 35871624,
    "role": "member",
    "affiliation_type_id": 150776,
    "organization_id": 2534
  },
  "financial_account": { "id": 33222604, "club_id": 2534, "holder_type": "Customership" }
}
Note: the address field in the response uses postcode (no underscore), but the request payload field is post_code. These are different — this is expected Rails behavior.

Customer List Pagination Behavior

GET /private_api/clubs/2534/customers?page=1&per_page=100 → returns array of 100 items
Response is a plain JSON array (not wrapped in an object with metadata). There is no total_count or X-Total-Count header exposed to JavaScript.
The hasMore heuristic in the script (items.length === 100) is correct — if a page returns fewer than 100 items, it's the last page.
The q=* query parameter used by the UI does not appear necessary for the import's paginator; page and per_page are sufficient.
The club currently has well over 1,000 customers (pages 1, 2, and 10 all return exactly 100 items).


Affiliation Types (Club 2534, all 24)
IDName1466412026 Member: Base1466402026 Member: Pro1466392026 Member: VIP144848Captain's Club131750Club Member143169Club Member Replay127481Employee127478Member: Pro136330Member: VIP150776SGC: Home ← used by test customer150775SGC: Pro10958Daily Fee127476Daily Junior Fee127475Daily Senior Fee140839PGA Hope127482Replay127702Replay Junior127701Replay Senior131879School Player144851Skylinks Birthday - Child / Veteran / First Responder152193Sunrise Special Player150289Sunset Special Player135567VIP Voucher - Golf Round128270Youth on Course
The Topsheet format uses names like "home" which the script tries to match to "sgc: home" via the fallback lookup — this is correct, since the API names are prefixed SGC: .

Club ID Resolution
localStorage.getItem('chronogolf.2534.appState') returns { organizationId: 2534, courseId: 2916 } — the resolveClubId() function correctly reads this. The URL hash fallback (/clubs/(\d+)) also works on this SPA.

Summary of Actionable Fixes for Claude Code

buildPayload() — wrap the returned object in { customer: { ... } }. This is the primary bug causing all imports to fail with HTTP 400.
getCsrfToken() — Angular injector is the only working source. The meta[name="csrf-token"] and XSRF-TOKEN cookie fallbacks always return empty string on this app. Remove them or leave as no-ops.
createCustomer() — remove X-XSRF-TOKEN header (unnecessary, no such cookie exists).
_lineNumber vs lineNumber — previously identified mismatch still applies; fix the property name consistently.


---

## Second Review

Import Failure Report — Post-Fix Investigation
Chronogolf Club 2534, May 3, 2026

Root Cause: getCsrfToken() Returns undefined in the Content Script Execution Context
The import still fails with HTTP 500 on every row. The error message returned by the server is:
"We're sorry, but something went wrong. We've been notified about this issue and we'll take a look at it shortly."
This is not a data or payload issue. A POST with no X-CSRF-Token header reliably reproduces this exact HTTP 500 response. All other valid payloads (with a correct token) return HTTP 201. The import is POSTing without a valid CSRF token on every request.
Why: The fix stripped getCsrfToken() down to the Angular injector only:
jsangular.element(document.body).injector().get('$http').defaults.headers.common['X-CSRF-Token']
This works fine in the browser's main JavaScript world (page context), but the extension's import script runs as a content script in an isolated world (world: 'ISOLATED', the Chrome default). In that world, window.angular is undefined — content scripts cannot access JavaScript variables set by the page. The try/catch silently swallows the TypeError and falls through, but with the fallbacks removed, getCsrfToken() now returns undefined unconditionally. It was returning '' before the fix (the meta tag and XSRF cookie fallbacks both came up empty), so this specific behavior wasn't actually changed — the feature was broken before too, just for the same underlying reason.

The Correct Fix for getCsrfToken()
The CSRF token is embedded in an inline <script> tag as part of window.CHRONOGOLF_CONFIG:
html<script>
  window.CHRONOGOLF_CONFIG = { ..., "CSRF_TOKEN": "<token>", ... }
</script>
Content scripts can read DOM text content, so the token can be reliably extracted by parsing that inline script. The token from CHRONOGOLF_CONFIG.CSRF_TOKEN is identical to the one Angular stores in $http.defaults.headers.common['X-CSRF-Token'] (verified: same 86-character token, exact match).
Recommended replacement for getCsrfToken():
jsfunction getCsrfToken() {
  // Primary: read from CHRONOGOLF_CONFIG inline script (works in isolated content script world)
  for (const s of document.querySelectorAll('script:not([src])')) {
    const m = s.textContent.match(/"CSRF_TOKEN"\s*:\s*"([^"]+)"/);
    if (m) return m[1];
  }
  // Fallback: try Angular injector (works if running in MAIN world)
  try {
    const token = angular.element(document.body).injector()
      .get('$http').defaults.headers.common['X-CSRF-Token'];
    if (token) return token;
  } catch (e) { /* isolated world — angular not accessible */ }
  return '';
}
This approach works in both isolated and main worlds. Alternatively, if the extension manifest allows it, declaring "world": "MAIN" in the content script registration would make the Angular injector approach work as originally intended.

Secondary Issue: affiliation_type_id Is Being Silently Overridden by the API
Observed during probing: POSTing affiliation_type_id: 150776 ("SGC: Home") consistently results in the customer being created with affiliation_type_id: 10958 ("Daily Fee") in the response. This affects every customer created through the API with that affiliation type. The payload is accepted (201), but the server substitutes a different affiliation type. This may be a club configuration issue (150776 requires specific eligibility or is restricted for API creation), but it means customers imported via the extension end up in the wrong membership tier. Worth flagging to Lightspeed support or investigating the affiliation type settings for 150776 vs 10958.

Summary for Claude Code
ItemStatusActioncustomer wrapper in buildPayload()✅ CorrectNo change neededX-XSRF-TOKEN header removed✅ CorrectNo change neededgetCsrfToken() — Angular-only after fix❌ Broken in isolated worldReplace with DOM inline-script parse (see above)Affiliation type override by API⚠️ Silent data issueInvestigate affiliation type 150776 permissions