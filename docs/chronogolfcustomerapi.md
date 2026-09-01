# Chronogolf / Lightspeed Golf — Customer API (browser / private_api)

Reverse-engineered live from `https://www.chronogolf.com/admin` on 2026-09-01 against
**Skylinks at Buchanan Fields, club_id / organization_id = 2534**.

All writes below were captured with an XHR interceptor that mocked the response and never
sent the request — **no customer records were created or modified.** Verified after the fact:
customer 18898362 unchanged, no `Jane Testerson` user exists.

---

## 0. Transport basics

| Item | Value |
|---|---|
| Base | `https://www.chronogolf.com/private_api` |
| Auth | session cookie (HttpOnly) — send `credentials: 'same-origin'` / `'include'` |
| Required header (writes) | `X-CSRF-Token: <86-char token>` |
| Other headers | `Accept: application/json, text/plain, */*`, `Content-Type: application/json` |
| Casing | **request/response JSON is `snake_case`** (the Angular view-models are camelCase — that's client-side only) |
| Pagination | `page` query param, 25/page; response headers `total` and `per-page` |

### Getting the CSRF token

The admin SPA reads it from a bootstrap blob in the `/admin` HTML:

```html
<script>window.CHRONOGOLF_CONFIG = {"AVAILABLE_LANGS":[...],"CSRF_TOKEN":"…", …}</script>
```

Two ways for the extension:

```js
// A. content script in the MAIN world (page context)
const csrf = window.CHRONOGOLF_CONFIG.CSRF_TOKEN;

// B. isolated world / service worker — refetch the shell and parse it
const html = await (await fetch('/admin', {credentials: 'include'})).text();
const csrf = html.match(/"CSRF_TOKEN":"([^"]+)"/)[1];
```

There is **no** `<meta name="csrf-token">` and **no** JS-readable session cookie. Rails masks the
token per request, so any freshly-issued one is valid — cache it per import run, not forever.

> Not verified: whether `private_api` actually rejects a missing `X-CSRF-Token`. Confirming it
> requires a real write, so I didn't. Send it — the app always does.

---

## 1. Find if a customer exists by email

Two different lookups exist. You almost certainly want **both**, in this order.

### 1a. Club customer search (is this person already a customer of club 2534?)

```
GET /private_api/clubs/2534/customers
      ?club_id=2534
      &page=1
      &q=((user.email:jane@example.com))
```

`q` is a Lucene-ish DSL over `user.full_name`, `user.email`, `user.phone`, `member_no`.
What the admin UI's search box sends for a free-text query `michael j`:

```
q=((user.full_name:michael j* OR user.email:michael j* OR user.phone:michael j* OR member_no:michael j*))
```

(spaces as `+`, `OR` as `+OR+` on the wire — just `encodeURIComponent` the whole `q`).

Behaviour confirmed:

- `user.email:jane@example.com` → **exact** full-value match, returns `[]` or a 1-element array.
- `user.email:jasienowski` → `[]`. **Without a trailing `*` it is not a substring match.** Append `*` for prefix search.
- Response headers carry `total` and `per-page: 25`.

**Recommended existence check:**

```js
const q = `((user.email:${email}))`;
const res = await fetch(
  `/private_api/clubs/2534/customers?club_id=2534&page=1&q=${encodeURIComponent(q)}`,
  {headers: {Accept: 'application/json'}, credentials: 'include'}
);
const hits = await res.json();
const existing = hits.find(c => c.email?.toLowerCase() === email.toLowerCase()) ?? null;
```

Still compare client-side. Don't trust the query to be exact for weird addresses.

### 1b. Global user directory (does a Chronogolf login exist anywhere?)

```
GET /private_api/users?attribute=email&query=jane@example.com
```

Returns `[]` or:

```json
[{"id":18898362,"email":"…","first_name":"…","last_name":"…",
  "phone":"…","gender":0,"date_of_birth":null,"tag_list":[]}]
```

- **Prefix match, not exact** — `query=michaeldjasienowski` matched `michaeldjasienowski@gmail.com`.
  Always re-compare `email.toLowerCase()` yourself; that's exactly what the app does.
- This is the call the Customer form fires on email blur (`verifyEmail`). On a hit the form sets
  `autocompletionStatus = 'email_existing'` and **prefills first/last/phone/gender/dob but NOT `id`** —
  i.e. it still POSTs a *create*, and the server links the existing global user to this club.
- `users.id` **is** the same value as `customers.id` (18898362 in both), so this endpoint is a
  cheap way to resolve email → customer id.

### 1c. Single customer by id

```
GET /private_api/clubs/2534/customers/{id}?club_id=2534   →  200, 36-key customer object
```

---

## 2. Create a new customer

Two requests, in order. The UI does #2 only after #1 succeeds.

### 2a. Create the customer

```
POST /private_api/clubs/2534/customers
Content-Type: application/json
X-CSRF-Token: …

{"customer":{
  "club_id": 2534,
  "first_name": "Jane",
  "last_name": "Testerson",
  "email": "jane@example.com",
  "phone": "5550100",
  "date_of_birth": "1985-04-20",
  "gender": 1,
  "member_no": "SGC-9999",
  "bag_number": "42",
  "address": {
    "address_one": "1500 Sally Ride Dr",
    "address_two": "Suite 100",
    "city": "Concord",
    "state_code": "CA",
    "postcode": "94520",
    "country_code": "US"
  }
}}
```

Verbatim captured minimal body (only 3 fields filled):

```json
{"customer":{"club_id":2534,"date_of_birth":null,"first_name":"Jane","last_name":"Testerson","email":"jane.doe.test2@example.com"}}
```

- Only `last_name` and a valid `email` are enforced by the client form (`ng-invalid` on empty last name; email must pass `valid('email', …)`).
- The app omits keys the user never touched — it does **not** send nulls for untouched fields.
  `date_of_birth` is the one exception (always present, `null` when empty).
- Response is the created customer, including `id`. You need that id for step 2b.

### 2b. Attach the player type (affiliation)

```
POST /private_api/organizations/2534/affiliations

{"affiliation":{
  "affiliation_type_id": 10958,
  "role": "public",
  "organization_id": 2534,
  "provider_id": 2534,
  "user_id": 18898362
}}
```

- `user_id` = `id` from the 2a response.
- `role` is **copied from the affiliation type's `default_role`**, not chosen by the operator.
  Confirmed on two types: `Daily Fee` → `"public"`, `SGC: Home` → `"member"`.
- `organization_id` / `provider_id` = the affiliation type's `organization_id` (2534 for all Skylinks types).

If you skip 2b the customer lands with no player type. The list view renders those as `Visitor`.

---

## 3. Update an existing customer

Also two requests. Same split: profile fields on the customer, player type on the affiliation.

### 3a. Profile

```
PUT /private_api/clubs/2534/customers/{customerId}

{"customer":{
  "id": 18898362,
  "email": "…", "first_name": "…", "last_name": "…", "phone": "…",
  "gender": 0, "date_of_birth": null,
  "uuid": "8dba1e95-…", "member_no": null, "bag_number": "77", "note": null,
  "club_id": 2534,
  "hidden_from_tee_sheet": null, "hidden_from_directory": null,
  "marketing_consent": false,
  "preferences": {"marketing_consent":"false","hidden_from_directory":null,"hidden_from_tee_sheet":null},
  "created_at": "2026-09-01T11:38:56.602-04:00",
  "player_type_locked_by_subscription": false,
  "membership_auto_renew": false,
  "financial_account": {"id":36243667,"archived_at":null,"club_id":2534,"holder_type":"Customership"},
  "address": null,
  "labels": "",
  "settings": null, "newsletter": false
}}
```

That is the **full captured body** — the app round-trips the whole object it read, minus
`activation_state`, `ref`, `last_login_at`, `last_activity_at`, `affiliation_type_id`,
`affiliation_type_ids`, `current_affiliation`, `affiliations`, `custom_fields_data`, `photo`,
`membership_start_date`, `membership_end_date`.

**Do not construct this payload from scratch.** GET the customer first, patch the fields you own,
PUT it back. Sending a partial body has not been tested and may null out columns.

Note: `affiliation_type_id` is *not* in this payload. Player type changes never go through here.

### 3b. Player type

```
PUT /private_api/affiliations/{affiliationId}

{"affiliation":{
  "id": 39071551,
  "role": "member",
  "organization_id": 2534,
  "provider_id": 2534,
  "affiliation_type_id": 150775,
  "owner":    {"id":2534,"name":"Skylinks at Buchanan Fields","type":"Club"},
  "provider": {"id":2534,"name":"Skylinks at Buchanan Fields","type":"Club"},
  "user_id": 18898362
}}
```

- `affiliationId` comes from the customer's `current_affiliation.id`.
- `organization_type` is present on the object you read but **dropped** from the payload; `user_id` is **added**.
- `GET /private_api/affiliations/{id}` is **404** — read-only access is via the customer object only.
- If `current_affiliation` is null, POST (§2b) instead of PUT.
- `role` stayed `"member"` when moving SGC: Home → SGC: Pro (both `default_role: member`).
  **Unverified:** whether the app rewrites `role` when crossing a member↔public boundary.
  Safest: set `role = affiliationType.default_role` on every write. That matches what create does.

### Email is read-only on existing customers

In the edit drawer the email input is disabled with a lock icon (`vm.isEmailReadOnly`), and the PUT
still echoes the existing address. Assume you **cannot** change a customer's email via this endpoint.
Match on email; never try to correct one.

---

## 4. Filling in all form fields

Full field inventory of the Customer drawer. `ng-model` shown for reference; the payload key is what
you send to the API.

| Label | DOM selector | ng-model | Payload key | Notes |
|---|---|---|---|---|
| Gender | `select[name=gender]` | `vm.customer.gender` | `gender` | option values `undefined:undefined` / `number:1` (Male) / `number:2` (Female); payload is `0`/`1`/`2` |
| First name | `input[name="first name"]` | `vm.customer.firstName` | `first_name` | note the **space** in the name attr |
| Last name | `input[name="last name"]` | `vm.customer.lastName` | `last_name` | required |
| Email | `input[name=email]` | `vm.customer.email` | `email` | `type=email`; **disabled when editing** |
| Date of birth | `input[name=dateOfBirth]` | `vm.customer.dateOfBirth` | `date_of_birth` | `YYYY-MM-DD`; datepicker widget — see warning below |
| Phone | `input[name=phone]` | `vm.customer.phone` | `phone` | `type=tel`, digits only in practice |
| Member N° | `input[name="member id"]` | `vm.customer.memberNo` | `member_no` | |
| Bag number | `input[name="bag number"]` | `vm.customer.bagNumber` | `bag_number` | |
| Street 1 | `input[name=addressOne]` | `vm.customer.address.addressOne` | `address.address_one` | |
| Street 2 | `input[name=addressTwo]` | `vm.customer.address.addressTwo` | `address.address_two` | |
| City | `input[name=city]` | `vm.customer.address.city` | `address.city` | |
| Country | the `<select>` whose options include `US` | — (directive) | `address.country_code` | ISO-3166-1 alpha-2 option values |
| Region | text input **until** a country is picked, then becomes a `<select>` | — (directive) | `address.state_code` | `CA` etc. |
| Postal code | `input[name=postcode]` | `vm.customer.address.postcode` | `address.postcode` | |
| Player type | `select[name=player-types]` | `optionId` | *(separate affiliation call)* | option values `number:<affiliationTypeId>` |

Not in the drawer but present on the record: `note`, `labels`, `newsletter`, `marketing_consent`,
`hidden_from_tee_sheet`, `hidden_from_directory`, `custom_fields_data`.
`GET /private_api/clubs/2534/custom_fields` → `[]`, so Skylinks has no customer custom fields today.

### Driving the form from the DOM (if you must)

AngularJS `ngModel` listens on `input`, so this works and was verified on every text field:

```js
function setField(selector, value) {
  const el = document.querySelector(selector);
  el.focus();
  el.value = value;
  el.dispatchEvent(new Event('input',  {bubbles: true}));
  el.dispatchEvent(new Event('change', {bubbles: true}));
  el.blur();
}
function setSelect(selector, value) {   // e.g. 'number:150776', 'US'
  const el = document.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new Event('change', {bubbles: true}));
}
```

Two traps found the hard way while typing with synthetic keystrokes:

1. **Date of birth is a datepicker.** Typing `1985-04-20` keystroke-by-keystroke produced
   `2026-09-01` in the field. Setting `.value` + `input` gives the right model value.
2. Field-to-field focus via clicking is unreliable in that drawer — two typed values landed in the
   wrong inputs. Set values by selector, never by tab/click sequence.

There is **no auto-save**. The drawer shows `Close` until the form is dirty, then `Cancel` / `Save`;
`Save` calls `vm.triggerSave()` → customer save → affiliation save.

---

## 5. Setting the player type

Player type = **affiliation type**. "Local player type" in the UI = the affiliation whose
`organization_id` is this club.

```
GET /private_api/organizations/2534/affiliation_types
```

Returns 25 objects: `id, name, organization_id, organization_type, organization_name, data{color},
default_role, default_player_role, publicly_visible, deleted, allow_member_directory,
booking_opening_time, booking_range, require_credit_card, bookable_on_marketplace,
excluded_from_member_identification`.

`/private_api/clubs/2534/affiliation_types` is **404** — it must be `organizations`.

### Skylinks player types (live, 2026-09-01)

| id | name | default_role |
|---|---|---|
| 146641 | 2026 Member: Base | member |
| 146640 | 2026 Member: Pro | member |
| 146639 | 2026 Member: VIP | member |
| 144848 | Captain's Club | member |
| 131750 | Club Member | member |
| 143169 | Club Member Replay | member |
| 127481 | Employee | member |
| 127478 | Member: Pro | member |
| 136330 | Member: VIP | member |
| 155882 | SGC: Birthday Round | member |
| 150776 | SGC: Home | member |
| 150775 | SGC: Pro | member |
| 10958 | Daily Fee | public |
| 127476 | Daily Junior Fee | public |
| 127475 | Daily Senior Fee | public |
| 140839 | PGA Hope | public |
| 127482 | Replay | public |
| 127701 | Replay Senior | public |
| 127702 | Replay Junior | public |
| 131879 | School Player | public |
| 144851 | Skylinks Birthday - Child \| Veteran \| First Responder | public |
| 152193 | Sunrise Special Player | public |
| 150289 | Sunset Special Player | public |
| 135567 | VIP Voucher - Golf Round | public |
| 128270 | Youth on Course | public |

**Resolve these by name at runtime, not from this table.** They're club config; SGC types get
re-created seasonally (note both `Member: Pro` and `2026 Member: Pro` already exist).

### Rules

- New customer → `POST /private_api/organizations/{org}/affiliations` with `user_id`.
- Existing customer with `current_affiliation` → `PUT /private_api/affiliations/{current_affiliation.id}`.
- Always set `role` = the type's `default_role`.
- `customer.affiliation_type_ids` is an array — a customer can hold several affiliations
  (18898362 has `[144770, 150776]`; 144770 isn't in club 2534's list, so it's from another org).
  `customer.affiliation_type_id` is the *current local* one. Don't clobber the array; only touch
  `current_affiliation`.
- The drawer disables the select entirely when `player_type_locked_by_subscription` is true
  (`vm.isPlayerTypeEditable`). Check that flag before trying to change a member's type — a
  subscription owns it.

---

## 6. Suggested import flow

```
for each Airtable row:
  1. GET /private_api/clubs/2534/customers?...q=((user.email:EMAIL))    → exact-match client-side
  2a. hit:
        GET  /private_api/clubs/2534/customers/{id}?club_id=2534        → full object
        PUT  /private_api/clubs/2534/customers/{id}                     → object + your patches
        PUT  /private_api/affiliations/{current_affiliation.id}         → if type differs
                                                                         and not locked
  2b. miss:
        GET  /private_api/users?attribute=email&query=EMAIL             → optional: prefill/warn
        POST /private_api/clubs/2534/customers                          → capture id
        POST /private_api/organizations/2534/affiliations                → with user_id
```

Throttle it. 9,062 customers across 363 pages of 25 means this list endpoint is not cheap, and
there's a Datadog RUM + Sentry agent on the page watching every 4xx you generate.

---

## 🔥 Devil's Advocate

- **This is an undocumented private API and you are building a business process on it.**
  `private_api` is the admin SPA's own backend. No versioning, no contract, no deprecation notice.
  The payload shape in §3a is literally "whatever the Angular view-model round-trips." A Lightspeed
  frontend refactor changes it silently and your import starts writing garbage. Budget for that
  breaking, and put a smoke test in front of the importer (create → read back → assert → delete or
  flag) rather than trusting a green 200.

- **Ask Lightspeed for the real API before you build this.** Lightspeed Golf has a partner/public
  API. If it covers customer create/update, the whole extension collapses into a server-side script
  with a stable contract and no CSRF scraping. Two emails is cheaper than maintaining this. I have
  not verified what that API covers — that's the thing worth checking first.

- **The PUT is a full-object round-trip and that's a data-loss hazard.** Read-modify-write with no
  ETag or version field. If a staff member edits a customer in the browser while your importer is
  mid-flight, last write wins and their change is gone. With one operator running imports manually
  it's fine; as a scheduled job it isn't.

- **The two-request write is not atomic.** Customer created, affiliation POST fails → a member sits
  in the system as `Visitor` and gets charged daily fee rates at the counter. That's a real revenue
  and guest-experience bug, not a cosmetic one. You need a reconciliation pass that finds
  recently-created customers with no local affiliation.

- **Skip the DOM-driving path entirely.** You now have the endpoints; §4's `setField` helper exists
  for completeness, but form automation means fighting a datepicker, a country/region select that
  mutates its own element type, and focus bugs I hit in five minutes of trying. Direct `fetch` from
  a content script with the CSRF token is less code and far less fragile.

- **Email as the join key is only as good as your Airtable data.** Prefix matching on
  `/private_api/users` plus 9k existing customers is a good recipe for attaching a membership to the
  wrong person. Compare exact + lowercase, and make a name mismatch on an email hit a hard stop for
  human review, not a warning.

- Biggest single risk if you ship as-is: **the non-atomic write in §2**, because it fails quietly and
  the symptom shows up at the register, days later.

---

## Appendix — endpoints touched

| Method | Path | Result |
|---|---|---|
| GET | `/private_api/clubs/2534/customers?club_id=&page=&q=` | 200, array, `total`/`per-page` headers |
| GET | `/private_api/clubs/2534/customers/{id}?club_id=2534` | 200, 36-key customer |
| POST | `/private_api/clubs/2534/customers` | create (captured, not sent) |
| PUT | `/private_api/clubs/2534/customers/{id}` | update (captured, not sent) |
| GET | `/private_api/users?attribute=email&query=` | 200, array, prefix match |
| GET | `/private_api/organizations/2534/affiliation_types` | 200, 25 types |
| POST | `/private_api/organizations/2534/affiliations` | create (captured, not sent) |
| PUT | `/private_api/affiliations/{id}` | update (captured, not sent) |
| GET | `/private_api/affiliations/{id}` | **404** |
| GET | `/private_api/clubs/2534/affiliation_types` | **404** — use `organizations` |
| GET | `/private_api/clubs/2534/custom_fields` | 200, `[]` |
| GET | `/private_api/clubs/2534/config` | 200 |
| GET | `/private_api/organizations/2534` | 200 |
| GET | `/private_api/session/user`, `/private_api/session/employment` | 200 |
| GET | `/private_api/clubs/2534/integrations` | 200 |
