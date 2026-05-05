Lightspeed Retail API — Agent Knowledge Base
Working with the Lightspeed Retail (R-Series) API Directly in the Browser

Overview
The Lightspeed Retail (R-Series) API is accessible directly within the browser during an active merchant session. No separate API key or OAuth token setup is required — the existing session cookie authenticates all requests. This makes it possible to use fetch() via javascript_tool to query and modify data on behalf of the logged-in user without any additional auth steps.

Authentication
Authentication is handled entirely by the browser's existing session cookie. When making fetch() calls, always include credentials: 'include' to pass the session cookie along:
jsfetch('/API/Account/305872/Customer.json', {
  headers: { 'Accept': 'application/json' },
  credentials: 'include'
})
No Bearer tokens, API keys, or headers beyond Accept: application/json are needed for read/write operations within an active session.

Discovering the Account ID
The account ID is required for virtually every API endpoint. It is not always visible on the page, but can be reliably retrieved with a single call:
jsfetch('/API/Account.json', { credentials: 'include' })
This returns an object like:
json{
  "Account": {
    "accountID": "305872",
    "name": "Skylinks at Buchanan Fields"
  }
}
Always fetch this first if the account ID is not already known.

Base URL Structure
All API endpoints follow this pattern:
/API/Account/{accountID}/{Resource}.json
/API/Account/{accountID}/{Resource}/{id}.json
Examples:

GET /API/Account/305872/Customer.json — list customers
GET /API/Account/305872/Customer/1234.json — single customer
PUT /API/Account/305872/Customer/1234.json — update a customer
GET /API/Account/305872/CustomerType.json — list customer types


The Customer Object & Contact's Custom Field
The Customer object has basic fields (customerID, firstName, lastName, customerTypeID, etc.), but contact information — including the custom field visible in the UI's "CUSTOM" column — lives in a nested Contact object. This must be explicitly requested using load_relations:
jsfetch('/API/Account/305872/Customer.json?load_relations=["Contact"]&limit=100', {
  credentials: 'include'
})
The custom field lives at customer.Contact.custom. It is a plain string and is not filterable server-side via standard query parameters (attempts to filter by Contact.custom=... or custom=... returned 0 results or 400 errors).

Filtering: Server-Side vs. Client-Side
The Lightspeed API supports direct field filters (e.g. ?customerTypeID=4), but nested relation fields like Contact.custom cannot be filtered server-side. Attempts tried that failed:

?Contact.custom=000%25 → returned 0 results
?custom=000%25 → 400 Bad Request ("did you mean customerID?")
?customerSearchText=000 → 400 Bad Request

The correct approach for filtering on the custom field is to paginate through all customers with Contact loaded, and filter client-side using a regex or string match.
With 8,156 customers and a limit of 100 per page (~82 pages), parallel batching is essential for performance. Run 10 concurrent requests per batch:
jsfor (let batch = 0; batch < totalBatches; batch++) {
  const batchPromises = [];
  for (let i = 0; i < 10; i++) {
    const offset = (batch * 10 + i) * 100;
    if (offset >= total) break;
    batchPromises.push(
      fetch(`/API/Account/305872/Customer.json?load_relations=["Contact"]&limit=100&offset=${offset}`, {
        credentials: 'include'
      }).then(r => r.json()).then(data => {
        const customers = Array.isArray(data.Customer) ? data.Customer : [data.Customer];
        return customers.filter(c => c.Contact && /^000\d{4}$/.test(c.Contact.custom));
      })
    );
  }
  const results = await Promise.all(batchPromises);
  // accumulate results...
}
This completed the full scan of 8,156 customers in roughly 10 seconds.

Pagination
The API response always includes @attributes with count, offset, and limit:
json{ "@attributes": { "count": "8156", "offset": "0", "limit": "100" } }
Use count from the first response to calculate total pages. Maximum limit value is 100. Always use offset to page through results.

Updating a Customer (PUT)
To update a customer, send a PUT to the individual customer endpoint with only the fields you want to change in the JSON body:
jsfetch(`/API/Account/305872/Customer/${customerID}.json`, {
  method: 'PUT',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  },
  credentials: 'include',
  body: JSON.stringify({ customerTypeID: 0 })
})
The API returns the full updated customer object wrapped in an envelope:
json{ "@attributes": { "count": "1" }, "Customer": { "customerID": "...", ... } }
Important gotcha: A successful update does NOT return data.customerID directly — it returns data.Customer.customerID. Any success-check logic must account for this envelope. Check for data.Customer or data.Customer.customerID, not data.customerID.

Customer Types
Customer types are stored as a separate resource and can be listed with:
GET /API/Account/{accountID}/CustomerType.json
customerTypeID: 0 means None (no type assigned). This is the default/blank state. All named types have IDs starting from 1.

Resources That Don't Exist (404s to Avoid)
During this session the following endpoints returned 404:

/API/Account/{id}/CustomField.json — not available in R-Series
/API/Account/{id}/Contact.json — contacts are not a top-level resource; they are always accessed as a relation on Customer


javascript_tool Async Pattern
The javascript_tool does not support top-level await. All async operations must be wrapped in an async IIFE and results stored on window for retrieval in a subsequent call:
js// Call 1: initiate async work
(async () => {
  const data = await fetch(...).then(r => r.json());
  window._myResult = data;
})();
'initiated'; // return value
js// Call 2: read result (after a wait)
JSON.stringify(window._myResult).slice(0, 2000);
Always wait at least 2 seconds between initiating an async fetch and reading the result, or use a longer wait for bulk operations.

Summary of What Was Accomplished

Discovered account ID (305872) via /API/Account.json
Confirmed total customer count (8,156) and API pagination structure
Paginated all customers with load_relations=["Contact"] in parallel batches of 10 requests
Filtered client-side using regex /^000\d{4}$/ against Contact.custom, finding 111 matches
Sent PUT requests to all 111 customers setting customerTypeID: 0 (None) in parallel batches of 10
Verified the updates by re-fetching a sample of updated customers and confirming customerTypeID: "0"