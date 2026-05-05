Syntax Errors (will cause runtime crashes)
1. Template literals missing backticks — used bare throughout
Many strings that should be template literals are written without backticks. Examples:

baseUrl: https://us.merchantos.com/API/Account/${ACCOUNT_ID} — missing backticks, will throw a ReferenceError
return Last ${weekdayShort(dateStr)} and return 4-wk ${weekdayShort(dateStr)} avg in anchorLabel() — missing backticks
label += · as of ${h12}:00 ${ampm} in updateHeaderUI() — missing backticks
Every api.get(...) call inside paginate({...}) in loadMeta():

js  api.get/Discount.json?limit=...  // missing backtick + parenthesis
These should be api.get(`/Discount.json?limit=${PAGE_SIZE}&...`)

throw new ErrorPagination guard hit for ${dateStr}) — missing backtick opening and the ( after Error; should be throw new Error(`Pagination guard hit for ${dateStr}`)
return api.get/Sale.json?... — same missing backtick/parenthesis pattern
Several log(...) calls: e.g. logMeta loaded: ... and logFetched ... are missing the opening ( — should be log(`Meta loaded: ...`)
Multiple flags.push(...) calls missing the opening (:

js  flags.push⚠️ Discount total is ...   // should be flags.push(`⚠️ ...`)
  flags.push⚠️ ${tr} refunds ...
  flags.push⚠️ Archived discount ...

html += </tbody></table> — missing backtick, should be html += `</tbody></table>`
Header textContent assignments: header.textContent = Refunds & Voids · ${refunds.length} today — missing backticks
$('lss-body').innerHTML = <div ...Loading…</div> (in load()) — missing backticks
$('lss-body').innerHTML = <div ...❌ Failed...${escHtml(err.message)}</div> — missing backticks

2. encodeURIComponent call uses > instead of (
jsconst tf = encodeURIComponent><,${s},${e});
Should be:
jsconst tf = encodeURIComponent(`<,${s},${e}`);
The > is a stray character and the backtick/parenthesis are missing.
3. applyBaseline — overwrites datasets array instead of pushing to it
jsconst ds = state.charts.hourly.data.datasets.filter(d => d.label === 'Today');
ds.push({ ... });  // pushes to local filtered copy
Array.filter() returns a new array. The push calls modify the local copy ds, not the chart's actual datasets. At the end, state.charts.hourly.data.datasets = ds re-assigns it, which would discard the original "Today" dataset if the label filter worked — but this is still fragile. The intent seems to be: start from all existing datasets and append, not filter down to just "Today". Should likely be:
jsconst ds = state.charts.hourly.data.datasets; // reference, not a filtered copy

Logic Errors
4. borderDash should be borderDash → borderDash is correct but borderDash: [5, 4] is inside ds.push({...}) — this is fine, but note that Chart.js uses borderDash only on line type datasets, which this is. No issue here actually.
5. clipHour applied to baseline dates but today's clip hour used for past dates
In load():
jsconst clipHour = isToday ? currentPacificHour() : null;
const bDates   = baselineDates(selectedDate, selectedAnchor);
// ...
baselineAgg = await getAgg(bDates[0], clipHour);
When selectedDate is today, clipHour correctly clips baseline data to the same hour of day (apples-to-apples). This is intentional and correct.
6. state.cache.delete(todayStr) on Refresh only deletes today's cache key
If a clipped version was cached (e.g. "2026-05-05@14"), that won't be cleared. Since getAgg intentionally skips caching for todayStr (the if (dateStr !== todayStr) guard), today's data is never cached in the first place — so this delete is a no-op but harmless.

Summary Table
#LocationTypeDescription1api config baseUrlSyntaxMissing backticks around template literal2anchorLabel()SyntaxMissing backticks on 2 return statements3loadMeta() — all 3 paginate callsSyntaxapi.get missing ( and backtick; string is not a valid expression4fetchSalesForDate() — encodeURIComponentSyntax>< instead of (\`` — stray >` character5fetchSalesForDate() — throw new ErrorSyntaxWritten as throw new ErrorPagination… — missing ( and backtick6fetchSalesForDate() — api.getSyntaxSame missing ( + backtick pattern7loadMeta() — log(...) callSyntaxlogMeta loaded:… — missing (8fetchSalesForDate() — log(...) callSyntaxlogFetched… — missing (9updateHeaderUI() — label +=SyntaxMissing backticks10evaluateExceptions() — 3× flags.pushSyntaxMissing ( before template literal11renderRefundsTable() — header.textContentSyntaxMissing backticks12renderRefundsTable() — closing html +=SyntaxMissing backticks on </tbody></table>13load() — 2× $('lss-body').innerHTMLSyntaxMissing backticks14applyBaseline() — hourly datasetsLogicfilter() returns a new array; baseline datasets would be lost if not for the re-assignment at the end — should directly reference the array, not filter it
Most of these errors (#1–13) look like the backticks were stripped during copy/paste or text processing. The template literals are structurally present but the backtick character (`) was dropped, leaving bare strings with ${...} interpolations that JavaScript will not parse.Currently the feature gives an error about not being logged in. Please verify the functionality of the API logic.34 steps34 stepsThe session is fully active and authenticated — the "not logged in" error is not a real auth problem. It's a bug in the auth-check URL. Here's the full picture:

Root Cause: Wrong Auth-Check URL
The script's apiClient is configured with:
baseUrl: `https://us.merchantos.com/API/Account/${ACCOUNT_ID}`
The init block then calls:
jsawait api.get('/Account.json?limit=1');
That concatenates to:
https://us.merchantos.com/API/Account/305872/Account.json?limit=1
But this endpoint does not exist in Lightspeed's API. The server returns:
json{ "httpCode": "404", "message": "Control 'Account.305872.Account' could not be found." }
The apiClient throws on a non-2xx response, the catch block fires, and the user sees the "not logged in" alert — even though the session is perfectly valid.

All Other Endpoints Are Fine
Every actual data endpoint works correctly (all 200 OK) and returns the key structure the script expects:
EndpointHTTP StatusResponse Keys/Sale.json?limit=1✅ 200@attributes, Sale/Discount.json?limit=1✅ 200@attributes, Discount/Category.json?limit=1✅ 200@attributes, Category/Employee.json?limit=1✅ 200@attributes, Employee

The Fix
The auth check just needs to use a valid endpoint. There are two clean options:
Option A — Check against a sub-resource that's already inside baseUrl (simplest, no other changes needed):
jsawait api.get('/Sale.json?limit=1');
// or
await api.get('/Employee.json?limit=1');
Option B — Fix the auth check to call the correct account endpoint directly (outside of baseUrl):
jsawait api.get(`https://us.merchantos.com/API/Account/${ACCOUNT_ID}.json?limit=1`);
This returns 200 with the account name, currency, etc. and is a semantically appropriate "am I logged in?" check — but only works if apiClient supports absolute URLs overriding the baseUrl.
Option A is the safer, simpler change since it doesn't require apiClient to handle absolute URL overrides.