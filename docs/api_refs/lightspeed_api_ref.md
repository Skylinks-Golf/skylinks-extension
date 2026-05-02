# Chronogolf / Lightspeed Golf + Lightspeed Retail — API Reference Doc

**For Skylinks Admin Chrome Extension — Browser Session API Usage***Compiled from live session inspection of `chronogolf.ca` (club ID: 2534, course ID: 2916) and `us.merchantos.com` (account ID: 305872)*

---

## Part 1 — Chronogolf / Lightspeed Golf (Private API)

### 1.1 Base URL & Authentication

The Chronogolf admin SPA is an AngularJS app hosted at `https://www.chronogolf.ca/admin`. All data API calls are relative to this origin.

**Base:** `https://www.chronogolf.ca`

**Authentication — CSRF Token (cookie-based session)**

The app uses Rails CSRF token authentication. The browser session cookie maintains the login state. Every mutating request (POST/PUT/PATCH/DELETE) must include the token as a header, which Angular injects automatically from the cookie.

`Header:  X-CSRF-Token: <value from "X-CSRF-TOKEN" cookie>
Cookie:  (session cookie maintained by browser — no manual handling needed in extension)`

**Default Request Headers (set by Angular $http globally):**

`Accept: application/json, text/plain, */*
X-CSRF-Token: <auto-injected from cookie>
Content-Type: application/json  (for POST/PUT/PATCH)`

The extension can read the CSRF token via:

js

`document.cookie  // look for X-CSRF-TOKEN value
// or via Angular injector:
angular.element(document.body).injector().get('$http').defaults.headers.common['X-CSRF-Token']`

**Key IDs from this session:**

| Variable | Value | How to get it |
| --- | --- | --- |
| `clubId` / `organizationId` | `2534` | URL path segment, or `localStorage['chronogolf.2534.appState']` |
| `courseId` | `2916` | `localStorage['chronogolf.2534.appState']` → `.courseId` |

---

### 1.2 Chronogolf Private API Endpoints

All endpoints are prefixed with `/private_api/`. The API uses standard REST conventions: `GET` for reads, `POST` for create, `PUT/PATCH` for update, `DELETE` for removal.

---

### Clubs & Organizations

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/clubs` | List all clubs |
| GET | `/private_api/clubs/{clubId}` | Get single club detail |
| GET | `/private_api/clubs/{clubId}/customers` | List customers for a club |
| GET | `/private_api/clubs/{clubId}/weather` | Current weather for club location |
| GET | `/private_api/clubs/{clubId}/lotteries` | Club lottery draws |
| GET | `/private_api/clubs/{clubId}/dynamic_pricing/schedules` | Dynamic pricing schedules |
| GET | `/private_api/clubs/{clubId}/no_shows` | No-show report data |
| GET | `/private_api/clubs/{clubId}/radar` | Radar (subscription monitoring) data |
| GET | `/private_api/organizations` | List organizations |
| GET | `/private_api/organizations/{orgId}` | Single organization |
| GET | `/private_api/organizations/{orgId}/employees/{id}` | Employee record |
| GET | `/private_api/organizations/{orgId}/deals/club` | Club deals/promotions |
| GET | `/private_api/management_companies` | Management company records |

---

### Courses

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/courses` | List courses (filter by `?club_id={clubId}`) |
| GET | `/private_api/courses/{courseId}` | Single course detail |
| GET | `/private_api/courses/{courseId}/teetimes` | Tee times for a course |
| GET | `/private_api/clubs/{clubId}/courses/{courseId}/teesheet_notes` | Notes on the tee sheet |
| GET | `/private_api/courses/{courseId}/teesheet_metrics` | Tee sheet occupancy metrics |

**Course instance methods (callable via Angular resource):**`getProducts()`, `getCartAvailability()`, `getColor()`, `getRegisterId()`, `getShopId()`

---

### Tee Sheets & Tee Times

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/teesheets` | Tee sheet records (takes date/course filters) |
| GET | `/private_api/teetimes` | Tee time slots |
| GET | `/private_api/pricing/rack_rates` | Rack rate pricing |
| GET | `/private_api/products/daily_templates` | Daily product templates |
| GET | `/private_api/products/schedules` | Product schedules |

**Common query params for teesheets:**

`?club_id=2534
?course_id=2916
?date=2026-04-27
?start_date=2026-01-01&end_date=2026-12-31
?per_page=100&page=1`

**TeeSheet static utility methods** (available in Angular, useful for extension data processing):
`groupByHour()`, `groupByDate()`, `groupByHourByDate()`, `chunkByTimeOfDay()`, `chunkByTimeOfYear()`, `groupByDayOfWeek()`, `calcBookings()`, `calcRounds()`

---

### Reservations

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/reservations` | List reservations (supports many filters) |
| GET | `/private_api/reservations/{id}` | Single reservation |
| POST | `/private_api/reservations` | Create reservation |
| PUT | `/private_api/reservations/{id}` | Update reservation |
| DELETE | `/private_api/reservations/{id}` | Cancel reservation |

**Instance methods on Reservation objects:**`save()`, `create()`, `update()`, `delete()`, `deleteAll()`, `getChain()`, `getInvoice()`, `isEditable()`, `isCancelled()`, `isCancellable()`, `isConfirmed()`, `isPending()`, `isChained()`, `isRecurring()`, `isDoubleBooking()`, `isHalfBooking()`, `isRequiringPayment()`, `isStandardPolicy()`, `getBooker()`, `getOwner()`, `getRounds()`, `countRounds()`, `getRoundLines()`, `getProductIds()`

---

### Events (Tournaments & Social)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/events` | All events |
| GET | `/private_api/events/tournaments` | Tournament events only |
| GET | `/private_api/events/social` | Social events only |
| GET | `/private_api/events/{eventId}/teetimes` | Tee times within an event |
| GET | `/private_api/events/{eventId}/reservations` | Reservations within an event |
| GET | `/private_api/events/{eventId}/attendees` | Event attendees |

**Event instance methods:**`save()`, `create()`, `update()`, `delete()`, `updateAll()`, `deleteAll()`, `getLinkedEvents()`, `getTeetimes()`, `getReservations()`, `getAttendees()`, `isTournament()`, `isSocial()`, `isPayAtGolf()`, `isPayOnline()`

---

### Customers

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/clubs/{clubId}/customers` | List all customers |
| GET | `/private_api/clubs/{clubId}/customers/{id}` | Single customer |
| POST | `/private_api/clubs/{clubId}/customers` | Create customer |
| PUT | `/private_api/clubs/{clubId}/customers/{id}` | Update customer |

**Customer instance methods:**`getLicenses()`, `getSubscriptions()`, `isMemberAtClub()`, `isMember()`, `isVisitor()`, `getType()`, `fullName()`, `initials()`, `isActive()`, `isPending()`, `hasAccount()`, `getDateOfBirth()`, `getGenderKey()`

---

### Products

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/products` | All products |
| GET | `/private_api/products/{id}` | Single product |
| GET | `/private_api/products/daily_templates` | Daily product templates |
| GET | `/private_api/products/schedules` | Product schedule configurations |

**Product types:** green fee, extra, kit, half cart
**Product instance methods:** `isGreenFeeType()`, `isExtraType()`, `isKitType()`, `isHalfCartType()`, `icon()`, `categoryLabel()`, `cartTypeLabel()`

---

### Payments & House Accounts

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/payments` | Payment records |
| GET | `/private_api/payments/{id}` | Single payment |
| GET | `/private_api/house_accounts` | House accounts |
| GET | `/private_api/house_accounts/{id}` | Single house account |
| GET | `/private_api/house_accounts/{houseAccountId}/statement` | Account statement |
| GET | `/private_api/bank_accounts` | Saved bank accounts |

**Payment states:** `isDue()`, `isPaid()`, `isFailed()`, `isCancelled()`, `isVoided()`, `isPending()`, `isSuccess()`, `isCancellable()`, `isVoidable()`

---

### Discounts, Packages & Promotions

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/discounts` | All discounts |
| GET | `/private_api/discounts/packages` | Packages (sold bundles) |
| GET | `/private_api/discounts/promo_codes` | Promo codes |

**Discount types:** `isPromoCode()`, `isDeal()`, `isDealChrono()`, `isDealClub()`, `isPackage()`, `isPackageSold()`

---

### Subscriptions & Memberships

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/subscriptions` | Subscription records |
| GET | `/private_api/subscriptions/{id}` | Single subscription |
| POST | `/private_api/subscriptions` | Create subscription |
| DELETE | `/private_api/subscriptions/{id}` | Cancel subscription |

**Subscription states:** `isActive()`, `isCancelled()`, `isUpcoming()`, `isCancellable()`

---

### Lotteries

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/lotteries` | All lotteries |
| GET | `/private_api/lotteries/{id}` | Single lottery |
| POST | `/private_api/lotteries/{id}/confirm` | Confirm lottery results |

**Lottery states:** `isOpened()`, `isClosed()`, `isConfirmed()`, `isBookable()`**Lottery methods:** `autoAssignment()`, `undoAssignments()`

---

### Affiliation Types & Player Types

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/organizations/{orgId}/affiliation_types` | All player/affiliation types for an org |
| GET | `/private_api/affiliation_types/{id}` | Single type |

**Methods:** `isRolePublic()`, `isRoleMember()`, `getTypeLabel()`, `requiresAffiliation()`, `allowMemberTeesheet()`

---

### Other Settings Endpoints

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/private_api/custom_fields` | Custom field definitions |
| GET | `/private_api/integrators` | Integrator connections |
| GET | `/private_api/clubs/{clubId}/radar` | Radar subscription status |

---

### 1.3 Pagination & Filtering

Chronogolf's private API supports standard query parameters:

`?page=1&per_page=100          — pagination
?club_id={clubId}             — filter by club
?course_id={courseId}         — filter by course
?start_date=YYYY-MM-DD        — date range start
?end_date=YYYY-MM-DD          — date range end
?date=YYYY-MM-DD              — specific date
?status=confirmed             — status filter
?include[]=payments           — sideload related data`

The Angular resource services also support `getAllPages()` to auto-paginate.

---

### 1.4 Response Format

All responses are JSON. Collections return an array; single records return an object. There is no envelope wrapper — the resource data is returned directly.

json

`// Collection example
[
  { "id": 123, "status": "confirmed", ... },
  { "id": 124, "status": "pending", ... }
]

// Single record
{ "id": 123, "status": "confirmed", "customer": {...}, ... }`

---

## Part 2 — Lightspeed Retail / Merchantos (R-Series API)

### 2.1 Base URL & Authentication

**Base:** `https://us.merchantos.com/API/Account/{accountID}/`

**Account ID for Skylinks at Buchanan Fields:** `305872`

**Authentication:** Cookie-based session (same browser session as the Retail POS login at `us.merchantos.com`). No token header needed — the session cookie is sent automatically by the browser.

The extension can confirm the account by fetching:

`GET https://us.merchantos.com/API/Account.json`

Response: `{"Account": {"accountID": "305872", "name": "Skylinks at Buchanan Fields", ...}}`

---

### 2.2 Lightspeed Retail API Endpoints

All endpoints follow the pattern: `GET /API/Account/{accountID}/{Resource}.json`

**Common query parameters:**

`?limit=100                    — records per page (max 100)
?offset=200                   — pagination offset
?load_relations=["Item"]      — JSON array of relations to sideload
?archived=false               — filter archived records
?completed=true               — filter completed sales
?timeStamp=%3E%2C2026-01-01   — timestamp filter (URL-encoded >,<)
?customerID=12345             — filter by customer
?employeeID=5                 — filter by employee
?shopID=1                     — filter by shop (always 1 for single-shop)`

---

### Account & Shop

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account.json` | Confirm account + get accountID |
| GET | `/API/Account/{id}/Shop.json` | Shop details (name, timezone, tax rates, config) |

**Shop fields:** `shopID`, `name`, `timeZone` (`America/Los_Angeles`), `taxLabor`, `isTaxInclusive`, `ccGatewayID`, `gatewayConfigID`

---

### Sales

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Sale.json` | List sales/transactions |
| GET | `/API/Account/{id}/Sale/{saleID}.json` | Single sale |
| GET | `/API/Account/{id}/SaleLine.json` | Line items across all sales |
| GET | `/API/Account/{id}/SalePayment.json` | Payments applied to sales |

**Sale fields:** `saleID`, `timeStamp`, `createTime`, `updateTime`, `completed`, `voided`, `archived`, `ticketNumber`, `employeeID`, `customerID`, `registerID`, `shopID`, `taxCategoryID`, `total`, `totalDue`, `calcTotal`, `calcSubtotal`, `calcTax1`, `calcPayments`, `calcDiscount`, `tax1Rate`, `balance`, `isTaxInclusive`, `referenceNumber`

**Useful Sale filters:**

`?completed=true&timeStamp=%3E%2C2026-01-01T00:00:00+00:00
?customerID=12345
?load_relations=["SaleLines","SalePayments","Customer","Employee"]`

---

### Items (Inventory)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Item.json` | List inventory items |
| GET | `/API/Account/{id}/Item/{itemID}.json` | Single item |

**Item fields:** `itemID`, `systemSku`, `customSku`, `description`, `itemType`, `defaultCost`, `avgCost`, `discountable`, `tax`, `archived`, `categoryID`, `taxClassID`, `departmentID`, `manufacturerID`, `Prices` → `ItemPrice[]` (with `useType: "Default"` and `"MSRP"`)

**Common item filters:**

`?categoryID=2                 — e.g., Driving Range items
?archived=false
?load_relations=["Category","ItemMatrix","Manufacturer"]`

---

### Categories

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Category.json` | All product categories |
| GET | `/API/Account/{id}/Category/{categoryID}.json` | Single category |

**Skylinks categories include:** Merchandise Balls (1), Driving Range (2), Golf (3), Instruction (4), Rentals (5), Gift Cards (8), Memberships (9), Initiation Fees (10), Food (11), and more.

**Category fields:** `categoryID`, `name`, `nodeDepth`, `fullPathName`, `parentID`, `leftNode`, `rightNode`

---

### Customers

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Customer.json` | List customers |
| GET | `/API/Account/{id}/Customer/{customerID}.json` | Single customer |

**Common filters:**

`?load_relations=["Contact","CreditAccount"]
?firstName=John&lastName=Smith`

---

### Employees

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Employee.json` | All employees |
| GET | `/API/Account/{id}/Employee/{employeeID}.json` | Single employee |

`?load_relations=["Role"]`

---

### Registers & Payments

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/Register.json` | Registers (POS terminals) |
| GET | `/API/Account/{id}/PaymentType.json` | Payment method types |
| GET | `/API/Account/{id}/SalePayment.json` | All payments on sales |

**Skylinks Registers:** Register 1, 2, and 3 (shopID: 1)

**Skylinks Payment Types:**`Cash`, `Check`, `VISA`, `Credit Account`, `Gift Card`, `Debit Card`, `AMEX`, `Discover`, `Mastercard`, `Raincheck`, `Punchcard - Driving Range`, `Punchcard - Golf Course`, `Captain's Club`, `Credit Card`

---

### Tax

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/API/Account/{id}/TaxCategory.json` | Tax categories |
| GET | `/API/Account/{id}/TaxClass.json` | Tax classes |

---

### 2.3 Pagination (Lightspeed Retail)

The Retail API paginates via `@attributes` in the response:

json

`{
  "@attributes": {
    "count": "410720",   // total records
    "offset": "0",       // current offset
    "limit": "100"       // records returned
  },
  "Sale": [ ... ]
}`

To paginate: increment `offset` by `limit` until `offset >= count`.

Maximum `limit` is `100` per request.

---

### 2.4 Response Format (Lightspeed Retail)

Responses are JSON (append `.json` to all endpoints). Single-record responses return the resource object directly; collection responses include the `@attributes` pagination wrapper.

---

## Part 3 — Extension Implementation Notes

### Reading the CSRF Token (Chronogolf)

js

`// From within the chronogolf.ca page context:
const injector = angular.element(document.body).injector();
const csrfToken = injector.get('$http').defaults.headers.common['X-CSRF-Token'];`

Or use `fetch`/`XMLHttpRequest` from the extension — the browser will automatically include all cookies for the domain, and Angular's CSRF header will be present if you mirror the same headers.

### Getting Current Club & Course Context

js

`const appState = JSON.parse(localStorage.getItem('chronogolf.2534.appState') || '{}');
const courseId = appState.courseId; // e.g. 2916
const clubId = 2534; // from URL or appState.organizationId`

### Calling Chronogolf API from Extension Background/Content Script

Since the session is cookie-based and the extension operates in the same browser:

js

`const response = await fetch('https://www.chronogolf.ca/private_api/clubs/2534/customers', {
  headers: {
    'Accept': 'application/json',
    'X-CSRF-Token': csrfToken  // obtained from page context
  },
  credentials: 'include'  // sends session cookies
});
const customers = await response.json();`

### Calling Lightspeed Retail API from Extension

js

`const response = await fetch('https://us.merchantos.com/API/Account/305872/Sale.json?limit=100&completed=true', {
  credentials: 'include'  // sends session cookies automatically
});
const data = await response.json();
const sales = data.Sale;
const total = data['@attributes'].count;`

---

## Part 4 — Key Entity IDs (Skylinks at Buchanan Fields)

| Entity | ID | Notes |
| --- | --- | --- |
| Chronogolf Club ID | `2534` | Used in all `/clubs/{clubId}/` paths |
| Chronogolf Org ID | `2534` | Same as club ID for single-club orgs |
| Chronogolf Course ID | `2916` | Buchanan Fields (9 holes) |
| Lightspeed Account ID | `305872` | Used in all `/API/Account/{id}/` paths |
| Lightspeed Shop ID | `1` | Single shop |
| Lightspeed Register IDs | `1`, `2`, `3` | Three POS registers |