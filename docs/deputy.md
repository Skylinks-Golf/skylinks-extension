Technical Report: Deputy Hours Data via Browser API
Purpose: Document the data retrieval and calculation methodology for implementing a weekly hours report in the Skylinks Chrome Extension.

1. Environment & Authentication
Base URL: https://348a3926020407.na.deputy.com
Authentication is entirely cookie-based. When a user is logged into the Deputy webapp, the browser automatically holds a session cookie (dp_logged_in) that is sent with every same-origin request. Because a Chrome extension content script injected on the Deputy domain shares the same origin, all fetch() calls made from the extension will be authenticated automatically — no Bearer token, no API key, no additional headers are required. The extension simply needs to be active while the user has Deputy open and logged in.

2. Supporting Endpoint: Operational Units
Before filtering shifts, the extension should load the list of areas (called Operational Units in Deputy) to confirm IDs haven't changed and to support dynamic name lookup.
Endpoint:
GET /api/v1/resource/OperationalUnit?max=100
Headers: Accept: application/json
Key fields in each record:
FieldTypeDescriptionIdintegerUnique identifier used to link shiftsOperationalUnitNamestringHuman-readable area nameActivebooleanWhether the area is currently in useColourstringHex color used in the roster UIRosterSortOrderintegerDisplay order in the roster view
Current Operational Unit ID Map for Skylinks:
IDNameCategory1ProshopProshop7Pro ShopProshop (legacy, unused)8TrainingProshop13Event HostProshop17Bev CartProshop18Outside ServicesProshop19Kids Zone / Patio / CartsProshop6AdminAdmin4Course Crew(separate — not in scope)

Note: OU ID 7 ("Pro Shop") exists in the system but had zero shifts scheduled during the test week. It appears to be a legacy entry. The active proshop area uses ID 1. The extension should include ID 7 in the proshop filter set as a safety net but it can be expected to contribute 0 hours.


3. Primary Data Endpoint: Roster (Shift Schedule)
Shifts are stored in the Roster resource. The GET endpoint does not support reliable date-range filtering via query string — it returned all 500 records regardless of date parameters. The correct method is the POST QUERY endpoint.
Endpoint:
POST /api/v1/resource/Roster/QUERY
Headers:
Accept: application/json
Content-Type: application/json
Request Body:
json{
  "search": {
    "s1": { "field": "Date", "type": "ge", "data": "2026-04-13" },
    "s2": { "field": "Date", "type": "le", "data": "2026-04-19" }
  },
  "sort": { "Date": "asc" },
  "start": 0,
  "max": 500
}
The search object supports multiple named conditions (s1, s2, etc.). The type field accepts standard comparison operators: ge (≥), le (≤), eq, ne, gt, lt. Date values are passed as YYYY-MM-DD strings. The start/max pair controls pagination; for a single week at Skylinks, all shifts fit within one request (55 records observed).

Note on select: A select field array was tested in the POST body but was ignored — the API always returns the full object. The extension should simply ignore unneeded fields client-side.


4. Roster Record Schema
Each record returned contains the following fields relevant to this feature:
FieldTypeDescriptionIdintegerUnique shift IDDateISO 8601 stringShift date, e.g. "2026-04-13T00:00:00-07:00"StartTimeUnix timestamp (seconds)Shift startEndTimeUnix timestamp (seconds)Shift endMealbreakISO 8601 stringBreak duration encoded as a datetime; time portion = break lengthTotalTimefloatNet paid hours (already accounts for meal break)OperationalUnitintegerForeign key → Operational Unit IDEmployeeintegerEmployee ID (0 = open/unassigned shift)OpenbooleanTrue if the shift is unassignedPublishedbooleanTrue if the shift has been published to employeesMatchedByTimesheetintegerTimesheet ID if a clock-in has been matched
TotalTime Verification:
The TotalTime field is in decimal hours and already has the meal break subtracted. Cross-checking confirmed: an 8-hour raw shift (EndTime - StartTime = 28800s) with a 30-minute meal break stores TotalTime: 7.5. The extension should use TotalTime directly — no manual calculation needed.

5. Filtering & Calculation Logic
javascript// Operational Unit ID sets
const PROSHOP_OU_IDS = new Set([1, 7, 8, 13, 17, 18, 19]);
const ADMIN_OU_IDS   = new Set([6]);

let proshopHours = 0;
let adminHours   = 0;
const proshopByArea = {};
const adminByArea   = {};

for (const shift of rosterData) {
  const ou = shift.OperationalUnit;
  const hrs = shift.TotalTime;

  if (PROSHOP_OU_IDS.has(ou)) {
    proshopHours += hrs;
    proshopByArea[ou] = (proshopByArea[ou] || 0) + hrs;
  } else if (ADMIN_OU_IDS.has(ou)) {
    adminHours += hrs;
    adminByArea[ou] = (adminByArea[ou] || 0) + hrs;
  }
}

const combinedTotal = proshopHours + adminHours;

6. Results for Week of Apr 13–19, 2026
CategoryShiftsTotal HoursProshop (all 6 sub-areas)50375.0 hAdmin537.5 hCombined Total55412.5 h
All 55 scheduled shifts for the week fell into one of these two categories. No shifts were assigned to Course Crew this week.

7. Implementation Notes for the Chrome Extension
Injection point: The content script should run on https://348a3926020407.na.deputy.com/*. No special permissions beyond cookies or storage are needed since auth is handled automatically via the shared session.
Suggested trigger: Add the report to the Schedule page (#/roster), triggered either on page load or via an injected button in the Deputy toolbar.
Date range detection: The current week's date range is visible in the URL hash and DOM. Alternatively, the extension can compute it from new Date() — find the Monday of the current week and add 6 days for Sunday.
Pagination: For a single week at current Skylinks staffing levels, max: 500 is more than sufficient. For any multi-week or month-range reports, implement pagination using start offset incremented by max until the returned array length is less than max.
OU ID stability: Operational Unit IDs are stable database IDs and are safe to hardcode. However, calling GET /api/v1/resource/OperationalUnit on init and building the ID map dynamically would be more resilient to any future area renaming.
Open shifts: Shifts where Employee === 0 and Open === true are unassigned. The current calculation includes them in the hour totals (matching what Deputy's own roster summary displays). If the extension should report only assigned shifts, add a filter for shift.Open === false.