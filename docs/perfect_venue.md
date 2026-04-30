Technical Report: Weekly Leads & Confirmed Events via Perfect Venue API
Prepared for: Skylinks Chrome Extension Integration
Date: April 22, 2026
Venue: Skylinks at Buchanan Fields (ID: 15749)

1. Overview
The Perfect Venue web app (app.perfectvenue.com) fetches its Analytics "Activity Overview" data from a private GraphQL API. By accessing the app's Apollo Client instance — which is exposed on the browser window object — the extension can piggyback on the user's existing authenticated session to make the same API calls the app makes natively, with no separate login or token management required.

2. API Endpoint
PropertyValueURLhttps://api.perfectvenue.com/graphqlMethodPOSTContent-Typeapplication/jsonAuthenticationBrowser session cookies (credentials: "include")Auth mechanismCookie-based (no Authorization header needed)
Authentication is handled entirely through the browser's session cookies. The app uses a RemoteRefreshToken managed internally by Apollo, but this is transparent to the caller — as long as the user is logged in to app.perfectvenue.com, any fetch call with credentials: "include" will be authenticated automatically. No tokens need to be extracted or stored.

3. GraphQL Operation
Operation Name: ConversionRateAnalyticsOverview
Full query string sent to the API:
graphqlquery ConversionRateAnalyticsOverview(
  $venueIds: [ID!]!,
  $startDate: ISO8601DateTime!,
  $endDate: ISO8601DateTime!,
  $comparisonStartDate: ISO8601DateTime,
  $comparisonEndDate: ISO8601DateTime
) {
  conversionRateAnalyticsOverview(
    venueIds: $venueIds
    startDate: $startDate
    endDate: $endDate
    comparisonStartDate: $comparisonStartDate
    comparisonEndDate: $comparisonEndDate
  ) {
    ...ConversionRateAnalyticsFragment
    __typename
  }
}

fragment ConversionRateAnalyticsFragment on ConversionRateAnalytics {
  startDate
  endDate
  comparisonStartDate
  comparisonEndDate
  newLeadsCount       { value comparisonValue changePercent __typename }
  confirmedEventsCount { value comparisonValue changePercent __typename }
  lostEventsCount     { value comparisonValue changePercent __typename }
  conversionRatePercent { value comparisonValue changePercent __typename }
  totalSalesAmount    { value comparisonValue changePercent __typename }
  totalPaymentsAmount { value comparisonValue changePercent __typename }
  averageResponseTimeMinutes { value comparisonValue changePercent __typename }
  __typename
}

4. Variables & Date Logic
The API uses ISO8601DateTime timestamps. The venue's timezone is America/Los_Angeles (Pacific Time: UTC-7 in PDT, UTC-8 in PST). The dates must be expressed as the start of each day in UTC, offset accordingly.
For a Monday–Sunday week in Pacific Time:
VariableLogicExample (week of Apr 13–19, 2026)venueIdsArray of the venue's ID (static)["15749"]startDateMonday 00:00 PT → UTC"2026-04-13T07:00:00.000Z"endDateFollowing Monday 00:00 PT → UTC (= exclusive end of Sunday)"2026-04-20T07:00:00.000Z"comparisonStartDatePrevious Monday 00:00 PT → UTC"2026-04-06T07:00:00.000Z"comparisonEndDateSame as startDate"2026-04-13T07:00:00.000Z"
Note on UTC offset: During PDT (Mar–Nov), offset is UTC-7 so midnight PT = 07:00 UTC. During PST (Nov–Mar), offset is UTC-8 so midnight PT = 08:00 UTC. The extension should calculate this dynamically using the Intl API or a library like date-fns-tz against America/Los_Angeles.

5. Full Request Payload Example
json{
  "operationName": "ConversionRateAnalyticsOverview",
  "variables": {
    "venueIds": ["15749"],
    "startDate": "2026-04-13T07:00:00.000Z",
    "endDate": "2026-04-20T07:00:00.000Z",
    "comparisonStartDate": "2026-04-06T07:00:00.000Z",
    "comparisonEndDate": "2026-04-13T07:00:00.000Z"
  },
  "query": "query ConversionRateAnalyticsOverview(...) { ... }"
}

6. Response Schema
The API returns a ConversionRateAnalytics object. Every metric follows the same ConversionAnalyticsDatum shape: a current-period value, a comparisonValue from the prior period, and a changePercent.
```
json{
  "data": {
    "conversionRateAnalyticsOverview": {
      "__typename": "ConversionRateAnalytics",
      "startDate": "2026-04-13T07:00:00Z",
      "endDate": "2026-04-20T07:00:00Z",
      "newLeadsCount":        { "value": 23, "comparisonValue": 17, "changePercent": 35.29 },
      "confirmedEventsCount": { "value": 11, "comparisonValue": 10, "changePercent": 10.0  },
      "lostEventsCount":      { "value": 1,  "comparisonValue": 3,  "changePercent": -66.67 },
      "conversionRatePercent":{ "value": 47.83, "comparisonValue": 58.82, "changePercent": -18.7 },
      "totalSalesAmount":     { "value": 384000, "comparisonValue": 450000, "changePercent": -14.67 },
      "totalPaymentsAmount":  { "value": 200000, "comparisonValue": 644000, "changePercent": -68.94 },
      "averageResponseTimeMinutes": { "value": 2424.65, "comparisonValue": 6169.67, "changePercent": -60.7 }
    }
  }
}
```
Note on monetary values: totalSalesAmount and totalPaymentsAmount are returned in cents (e.g., 384000 = $3,840.00).

7. Actual Data Retrieved (Week of Apr 13–19, 2026)
MetricThis WeekPrev Week (Apr 6–12)ChangeNew Leads2317+35.29%Confirmed Events1110+10.0%Lost Leads13-66.67%Conversion Rate47.83%58.82%-18.7%Total Sales$3,840.00$4,500.00-14.67%Total Payments$2,000.00$6,440.00-68.94%Avg Response Time2,424.65 min6,169.67 min-60.7%

8. Chrome Extension Implementation Notes
Execution context: The script must run in a content script context with access to window (i.e., a MAIN world content script), because window.__APOLLO_CLIENT__ is a page-level variable.
Recommended fetch approach: Rather than accessing Apollo directly, the simplest and most robust implementation is a direct fetch call from the content script:
javascriptasync function getWeeklyAnalytics(venueId, mondayDate) {
  // mondayDate: a Date object set to Monday 00:00 local time
  const tz = 'America/Los_Angeles';

  // Convert Monday midnight PT to UTC ISO string
  const startDate = toUTCISOString(mondayDate, tz);        // e.g., "2026-04-13T07:00:00.000Z"
  const endDate   = toUTCISOString(addDays(mondayDate, 7), tz); // next Monday = end of week
  const compStart = toUTCISOString(addDays(mondayDate, -7), tz);
  const compEnd   = startDate;

  const response = await fetch('https://api.perfectvenue.com/graphql', {
    method: 'POST',
    credentials: 'include',          // <-- uses the browser's existing session cookies
    headers: { 'Content-Type': 'application/json', 'Accept': '*/*' },
    body: JSON.stringify({
      operationName: 'ConversionRateAnalyticsOverview',
      variables: { venueIds: [venueId], startDate, endDate, comparisonStartDate: compStart, comparisonEndDate: compEnd },
      query: QUERY_STRING  // the full query string from section 3 above
    })
  });

  const json = await response.json();
  return json.data.conversionRateAnalyticsOverview;
}
Getting the venueId: The ID 15749 is specific to Skylinks at Buchanan Fields. It can be read from window.__APOLLO_CLIENT__.cache.extract() at the Venue:* key, or hardcoded if the extension is single-venue.
No additional auth required: As long as the user has an active session on app.perfectvenue.com, credentials: "include" passes the session cookies automatically. The extension does not need to handle tokens, headers, or login flows.

9. How the Data Was Obtained

The Analytics page (/reports/analytics) was loaded and a network request interceptor was installed via javascript_tool before page interactions.
Apollo Client was identified on window.__APOLLO_CLIENT__. Its query store (queryManager.queries) was iterated to locate the ConversionRateAnalyticsOverview query document and its variable structure.
The existing cached data (for the rolling "past 7 days" window used by the UI) was inspected to confirm the date format and UTC offset convention.
A fresh client.query() call was made via fetchPolicy: 'network-only' with recalculated Mon–Sun dates, confirmed by a POST to https://api.perfectvenue.com/graphql with credentials: "include" and standard Content-Type: application/json headers only.
The response was captured and validated against the UI-displayed values.