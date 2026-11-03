# SelectPi (Select Pi Ace) — API Reference Document

**For Skylinks Admin Chrome Extension — Browser Session API Usage***Compiled from live session inspection of `portal.getselectpi.com` (Skylinks at Buchanan Fields)*

---

## 1. Overview & Base URL

SelectPi is a Vue 3 SPA for managing a golf driving range ball-dispensing and point-of-sale system. It handles stations (ball dispensers), pin codes, cashier operations, member accounts, hotkeys, and comprehensive reporting.

**Base URL:** `https://portal.getselectpi.com/`

**API Base:** `https://portal.getselectpi.com/api/`

**App:** Vue 3, single-page, bundled with Vue CLI (`/js/app.df769acd.js`, `/js/chunk-vendors.7353824d.js`)

---

## 2. Authentication

### Token Storage

The app stores the JWT in `localStorage`:

js

`const token = localStorage.getItem('token');
const endpoint = localStorage.getItem('endpoint'); // "https://portal.getselectpi.com/"`

### Request Headers (All API Calls)

Every API call requires:

`Authorization: Bearer <token>
Content-Type: application/json`

### Session Maintenance

The app periodically calls `api/Token/KeepAlive` (POST with empty body `{}`) to prevent session expiry. The extension should replicate this to keep the session alive during long operations.

### Making API Calls from Extension

All API endpoints use **HTTP POST** with a **JSON body**:

js

`const token = localStorage.getItem('token');
const endpoint = localStorage.getItem('endpoint'); // or hardcode "https://portal.getselectpi.com/"

async function selectPiApi(path, body = {}) {
  const response = await fetch(endpoint + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(body)
  });
  return response.json();
}

// Example:
const categories = await selectPiApi('api/Category/getList');`

---

## 3. Token / Auth Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Token/Login` | Authenticate — get JWT token | `{username, password}` |
| `api/Token/Logout` | Sign out | `{}` |
| `api/Token/KeepAlive` | Keep session alive (call periodically) | `{}` |
| `api/Token/AutoLogin` | Login with saved credentials | `{}` |
| `api/Token/ValidateMfa` | Validate MFA code | `{mfaCode}` |
| `api/Token/AssignTenant` | Switch active tenant/site | `{tenantId}` |

---

## 4. Settings Endpoints

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Setting/Get` | Get default settings | `{}` | `{model: {defaultCategoryId, globalId}}` |
| `api/Setting/GetSiteSettings` | Site-level settings | `{siteSettingName}` *(required)* | site config object |
| `api/Setting/GetPinCode` | Pin code generation settings | `{}` | `{pincodeDigits, ticketFont, ticketHeader, pincodeExpirationDays, endOfDayExpiration, globalId, uniquePincode, pageBreak}` |
| `api/Setting/GetPosSettings` | Point-of-sale settings | `{}` | `{linkRangeGift, propagateColors, hideCashierNameOnReceipt}` |
| `api/Setting/GetUserSettings` | User-level preferences | `{}` | `{hideDisabledUsers}` |
| `api/Setting/GetOperatingHours` | Operating hours config | `{}` | `{alwaysOn, start, end}` |
| `api/Setting/GetRequiredFields` | Required field config | `{}` | required fields config |
| `api/Setting/GetHotkeyColors` | Hotkey color palette | `{}` | color config |
| `api/Setting/GetCardReload` | Card reload settings | `{}` | card reload config |
| `api/Setting/GetPosSettings` | POS settings | `{}` | POS config |
| `api/Setting/Save` | Save default settings | `{defaultCategoryId, globalId}` | success response |
| `api/Setting/SaveSiteSettings` | Save site settings | `{siteSettingName, ...fields}` | success response |
| `api/Setting/SavePinCode` | Save pin code settings | `{pincodeDigits, ...}` | success response |
| `api/Setting/SavePosSettings` | Save POS settings | `{...}` | success response |
| `api/Setting/SaveUserSettings` | Save user preferences | `{hideDisabledUsers}` | success response |
| `api/Setting/SaveOperatingHours` | Save operating hours | `{alwaysOn, start, end}` | success response |
| `api/Setting/SaveRequiredFields` | Save required fields | `{...fields}` | success response |
| `api/Setting/SaveHotkeyColors` | Save hotkey colors | `{...}` | success response |
| `api/Setting/SaveCardReload` | Save card reload config | `{...}` | success response |
| `api/Setting/SaveCreditCardFees` | Save CC fee settings | `{...}` | success response |

---

## 5. Category Endpoints

Categories are the product/service groupings (e.g., "Standard").

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Category/getList` | List categories (simple, for dropdowns) | `{}` | `{categoryList: [{globalId, categoryText}]}` |
| `api/Category/GetAll` | Full category list | `{}` | `{models: [{...}]}` |
| `api/Category/getSubscriptionList` | Categories for subscriptions | `{}` | category list |
| `api/Category/create` | Create a new category | `{categoryText, ...}` | `{model: {...}}` |
| `api/Category/save` | Update a category | `{globalId, categoryText, ...}` | `{model: {...}}` |

**Sample Category Response (`getList`):**

json

`{
  "categoryList": [
    { "globalId": "8ecb5571-e207-4ba6-b343-fcf542b25044", "categoryText": "Standard" }
  ]
}`

---

## 6. Hotkey Endpoints

Hotkeys are the quick-sale buttons (e.g., "Warm Up Bucket $5", "Large Bucket $12").

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Hotkey/getAll` | List all hotkeys | `{}` | `{models: [HotkeyObject]}` |
| `api/Hotkey/getActive` | List active hotkeys only | `{}` | `{models: [...]}` |
| `api/Hotkey/get` | Get single hotkey | `{globalId}` | `{model: HotkeyObject}` |
| `api/Hotkey/create` | Create hotkey | `{HotkeyObject}` | `{model: {...}}` |
| `api/Hotkey/save` | Update hotkey | `{HotkeyObject with globalId}` | `{model: {...}}` |
| `api/Hotkey/delete` | Delete hotkey | `{globalId}` | success |
| `api/Hotkey/GetAsInventory` | Get hotkeys formatted as inventory | `{}` | inventory-formatted list |
| `api/Hotkey/CreateToInventory` | Create hotkey from inventory item | `{...}` | created hotkey |

**Hotkey Object Fields:**

json

`{
  "globalId": "b381e3b6-67aa-44fc-b8a9-b2f4c860813d",
  "keyCaption": "Warm Up Bucket",
  "hotKeyCmd": "F2",
  "hotKeyType": 0,
  "displayed": true,
  "categoryId": "8ecb5571-e207-4ba6-b343-fcf542b25044",
  "price": 5.00,
  "toAccount": 0,
  "displayOrder": 2,
  "customBalls": 0,
  "keyColor": "#6495ED",
  "updateCustomerCategory": false,
  "useCaption": true,
  "useCaptionForMobile": true,
  "duration": 0,
  "doorId": null,
  "useCount": 1,
  "keySku": "",
  "generalLedgerName": "",
  "menuGroupId": "00000000-0000-0000-0000-000000000001",
  "isOpenKey": false,
  "screenSection": 1,
  "isCustomColor": false,
  "inMinutes": false
}`

**Hotkey Types (hotKeyType):**

| Value | Description |
| --- | --- |
| `0` | Time/minutes-based (e.g., Warm Up) |
| `1` | Ball bucket — Large |
| `2` | Ball bucket — Jumbo |
| `3` | Ball bucket — Mega |

**Skylinks Hotkeys:** Warm Up Bucket (F2, $5), Large Bucket (F3, $12), Jumbo Bucket (F4, $17), Mega Bucket (F5, $20)

---

## 7. Station Endpoints

Stations are the physical ball dispenser machines.

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Station/getAll` | List all stations | `{}` | `{models: [StationObject]}` |
| `api/Station/getAllList` | Flat list of stations | `{}` | list |
| `api/Station/GetBySite` | Stations for current site | `{}` | stations list |
| `api/Station/GetByUsername` | Stations accessible by user | `{}` | stations list |
| `api/Station/Get` | Single station | `{globalId}` | `{model: StationObject}` |
| `api/Station/GetInfo` | Station runtime info | `{globalId}` | station status/info |
| `api/Station/GetStationStatus` | Current online/offline status | `{globalId}` | status object *(admin only)* |
| `api/Station/GetStationStatusUser` | User-level station status | `{globalId}` | status object |
| `api/Station/save` | Update station config | `{StationObject}` | `{model: {...}}` |
| `api/Station/delete` | Remove station | `{globalId}` | success |
| `api/Station/getOptions` | Station option list | `{}` | options |
| `api/Station/GetAllTBoxes` | List all T-Box stations | `{}` | T-Box list |
| `api/Station/GetTBoxTimes` | T-Box session times | `{globalId}` | time slots |
| `api/Station/SaveTBoxTime` | Save T-Box time | `{...}` | success |
| `api/Station/IsTboxAvailable` | Check T-Box availability | `{globalId}` | availability |
| `api/Station/StopTBox` | Stop T-Box session | `{globalId}` | success |
| `api/Station/GetLatPay` | Get late-pay status | `{globalId}` | status |
| `api/Station/SaveLatPay` | Save late-pay setting | `{globalId, ...}` | success |
| `api/Station/RebootAll` | Reboot all stations | `{}` | success *(admin only)* |
| `api/Station/SaveCommands` | Send commands to station | `{globalId, commands}` | success |
| `api/Station/SetStationOperationStatus` | Set online/maintenance/offline | `{globalId, status}` | success |
| `api/Station/UploadStationLog` | Upload station log file | multipart | success |

**Station Object Fields:**

json

`{
  "globalId": "142bac96-23e9-4954-9648-1094d6234107",
  "stationName": "LEFT",
  "stationType": 1,
  "useBillAcceptor": false,
  "disablePincodes": false,
  "disableCreditCards": false,
  "disableMemberCards": true,
  "disableCardReader": false,
  "disableMobileApp": false,
  "useQrCodes": false,
  "useDataCap": false,
  "currencyCode": 840,
  "startUpDelay": 10,
  "isChannelDispenser": false,
  "channelBallCount": 9,
  "siteSettings": "sitesetting01",
  "bayId": 0,
  "hideBalls": false,
  "rebootOnFreeze": false,
  "stationHomeImage": "",
  "dispenserId": "",
  "enableDispensePush": false,
  "dynamicQR": false,
  "cardReaderType": 4,
  "pulseLength": 50,
  "pulseSeparator": 250,
  "directPincodeScan": false,
  "pulseProfile": 0,
  "disableTokenProcessing": false
}`

**Skylinks Stations:** LEFT (`142bac96-...`), RIGHT (`11be5d70-...`) — both type 1

---

## 8. Pin Code Endpoints

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Pincode/generate` | Generate a new pin code | `{quantity, categoryId, hotkeyId, price}` | `{model: PincodeObject}` |
| `api/Pincode/get` | Get pin code details | `{pinCode}` | `{model: PincodeObject}` |
| `api/Pincode/Inquire` | Look up pin code status | `{pincode}` | `{model: PincodeObject or null}` |
| `api/Pincode/cancel` | Cancel/void a pin code | `{globalId}` | success |
| `api/Pincode/GenerateBatch` | Batch generate pin codes | `{quantity, categoryId, hotkeyId, price}` | batch result |
| `api/Pincode/GenerateDoor` | Generate door access pin | `{...}` | door pin |
| `api/Pincode/DoorGet` | Get door pin details | `{pincode}` | door pin details |
| `api/Pincode/DoorCancel` | Cancel door pin | `{globalId}` | success |

**Pin Code Object Fields:**

json

`{
  "globalId": "9a745e4e-5b91-4a9b-8a58-95800eb130ab",
  "pinCode": "7397",
  "bucketSize": 0,
  "expirationTimestamp": 1777359599000,
  "balls": 25,
  "hotkeyId": "b381e3b6-67aa-44fc-b8a9-b2f4c860813d",
  "transactionId": "...",
  "chargeAmount": 5.00,
  "hotkeyCaption": "Warm Up Bucket",
  "message": "",
  "useCount": 1,
  "originalUseCount": 1,
  "pinCodeSecure": "****",
  "dispenseBalls": true
}`

---

## 9. Member Endpoints

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Member/SearchMembers` | Search members | `{searchPhrase, pageSize, pageNum}` | `{models: [MemberObject]}` |
| `api/Member/SearchMembersBySingleField` | Search by specific field | `{field, searchPhrase, pageSize, pageNum}` | `{models: [...]}` |
| `api/Member/get` | Get member by ID | `{globalId}` *(required)* | `{model: MemberObject}` |
| `api/Member/GetByMemberCard` | Look up by card number | `{memberCardNumber}` | `{model: MemberObject}` |
| `api/Member/GetByMemberCardAll` | All cards for member | `{memberId}` | `{models: [...]}` |
| `api/Member/add` | Create new member | `{MemberObject}` | `{model: {...}}` |
| `api/Member/save` | Update member | `{MemberObject with globalId}` | `{model: {...}}` |
| `api/Member/delete` | Delete member | `{globalId}` | success |
| `api/Member/getHistory` | Member transaction history | `{globalId, pageSize, pageNum}` | `{models: [...]}` |
| `api/Member/BalanceAdd` | Add credit to member account | `{globalId, amount, categoryId}` | updated balance |
| `api/Member/BalanceAddByHotkey` | Add balance via hotkey | `{globalId, hotkeyId}` | updated balance |
| `api/Member/AddLinkedEmail` | Link email to account | `{globalId, email}` | success |
| `api/Member/RemoveLinkedEmail` | Unlink email | `{globalId, email}` | success |
| `api/Member/GetAllLinkedEmails` | Get linked emails | `{globalId}` | `{models: [{email, ...}]}` |
| `api/Member/ExportMembers` | Export member list (CSV) | `{...filters}` | file/download |
| `api/Member/UploadFile` | Bulk import members | multipart form-data | import result |
| `api/Member/UploadFileUpdate` | Bulk update members | multipart form-data | update result |

**SearchMembers searchable fields:** Last name, First name, "Last, First", Email, Mobile phone

---

## 10. Member Card Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/MemberCard/getAll` | Get all cards for a member | `{customerId}` *(required)* |
| `api/MemberCard/add` | Add card to member | `{customerId, cardNumber, ...}` |
| `api/MemberCard/save` | Update member card | `{globalId, ...}` |
| `api/MemberCard/delete` | Remove member card | `{globalId}` |
| `api/MemberCard/UploadFileUpdateCards` | Bulk update cards | multipart |

---

## 11. Cart / Transaction Endpoints

| Endpoint | Purpose | Request Body | Key Response Fields |
| --- | --- | --- | --- |
| `api/Cart/GetCart` | Get active cart | `{cartKey}` *(required)* | `{model: CartObject}` |
| `api/Cart/GetCartDetails` | Cart line items | `{cartKey}` | cart line details |
| `api/Cart/SaveCart` | Save/update cart | `{CartObject}` | `{model: {...}}` |
| `api/Cart/GetCartStatus` | Cart status | `{cartKey}` | status |
| `api/Cart/SetCartStatus` | Update cart status | `{cartKey, status}` | success |
| `api/Cart/MarkDeleted` | Void/delete cart | `{cartKey}` | success |
| `api/Cart/GetCartHistory` | Historical transactions | `{pageSize, pageNum, startDate?, endDate?}` | `{models: [CartHistory]}` |
| `api/Cart/GetCartHistoryByMember` | Transactions by member | `{memberId, pageSize, pageNum}` | `{models: [...]}` |
| `api/Cart/GetPayments` | Payments on a cart | `{cartKey}` | `{models: [PaymentObject]}` |
| `api/Cart/SavePayments` | Record payments | `{cartKey, payments: [...]}` | success |
| `api/Cart/ProcessPayment` | Process credit card payment | `{cartKey, amount, paymentMethod}` | payment result |
| `api/Cart/GetTokenFromReader` | Get CC token from card reader | `{terminalId}` | token |
| `api/Cart/GetPaymentCards` | Saved payment cards | `{memberId}` | card list |
| `api/Cart/SetCartPaymentStatus` | Update payment status | `{cartKey, status}` | success |
| `api/Cart/GetRefundableItems` | Get items eligible for refund | `{cartKey}` | refundable items |
| `api/Cart/RefundPayments` | Process refunds | `{cartKey, items: [...]}` | refund result |
| `api/Cart/RollbackPayment` | Rollback failed payment | `{cartKey, paymentId}` | success |
| `api/Cart/LogCreditCardRequest` | Log CC request for audit | `{...}` | success |
| `api/Cart/LogCreditCardResponse` | Log CC response for audit | `{...}` | success |
| `api/Cart/LogPriceChange` | Log manual price change | `{cartKey, oldPrice, newPrice}` | success |

---

## 12. Gift Card Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/GiftCard/GetAll` | List all gift cards | `{}` |
| `api/GiftCard/get` | Get single gift card | `{cardNumber}` |
| `api/GiftCard/Purchase` | Sell a gift card | `{amount, paymentMethod}` |
| `api/GiftCard/TenderWith` | Use gift card for payment | `{cartKey, cardNumber, amount}` |
| `api/GiftCard/RefundAdd` | Add refund to gift card | `{cardNumber, amount}` |
| `api/GiftCard/delete` | Delete/void gift card | `{globalId}` |

---

## 13. Discount Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Discount/getAll` | List all discounts | `{}` |
| `api/Discount/create` | Create discount | `{name, percent, ...}` |
| `api/Discount/save` | Update discount | `{globalId, ...}` |
| `api/Discount/delete` | Delete discount | `{globalId}` |

---

## 14. Inventory Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Inventory/getAll` | List all inventory items | `{}` |
| `api/Inventory/get` | Get single item | `{globalId}` |
| `api/Inventory/create` | Create inventory item | `{name, price, ...}` |
| `api/Inventory/save` | Update inventory item | `{globalId, ...}` |
| `api/Inventory/delete` | Delete item | `{globalId}` |
| `api/Inventory/getHistory` | Item transaction history | `{globalId}` |
| `api/Inventory/QuantityUpdate` | Update stock quantity | `{globalId, quantity}` |
| `api/Inventory/SaveScreenLayout` | Save display layout | `{layout: {...}}` |
| `api/Inventory/UploadFile` | Bulk import items | multipart |

---

## 15. Menu Group Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/MenuGroup/getAll` | List menu groups | `{}` |
| `api/MenuGroup/get` | Single menu group | `{globalId}` |
| `api/MenuGroup/create` | Create menu group | `{menuGroupName, parentId, menuOrder, ...}` |
| `api/MenuGroup/save` | Update menu group | `{globalId, ...}` |
| `api/MenuGroup/delete` | Delete menu group | `{globalId}` |
| `api/MenuGroup/swap` | Reorder menu groups | `{globalId1, globalId2}` |
| `api/MenuGroup/SaveScreenLayout` | Save layout | `{layout}` |

**MenuGroup Object Fields:** `menuGroupName`, `parentId`, `menuLevel`, `menuOrder`, `globalId`, `backgroundColor`, `foregroundColor`, `screenSection`

---

## 16. Tax Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Tax/getAll` | List all tax rates | `{}` |
| `api/Tax/create` | Create tax rate | `{name, rate, ...}` |
| `api/Tax/save` | Update tax rate | `{globalId, ...}` |
| `api/Tax/delete` | Delete tax rate | `{globalId}` |

---

## 17. Location Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Location/getAll` | List locations | `{}` |
| `api/Location/save` | Save location | `{name, ...}` |
| `api/Location/delete` | Delete location | `{globalId}` |
| `api/Location/getGpsCoordinates` | Get GPS coords for location | `{address}` |

---

## 18. Terminal Endpoints

Terminals are credit card/payment terminals.

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Terminal/getAll` | List all terminals | `{}` |
| `api/Terminal/create` | Create terminal | `{terminalName, terminalId, ...}` |
| `api/Terminal/save` | Update terminal | `{globalId, ...}` |
| `api/Terminal/delete` | Delete terminal | `{globalId}` |
| `api/Terminal/GetAllTerminalIds` | Get terminal IDs only | `{}` |
| `api/Terminal/MarkActive` | Set active terminal | `{globalId}` |

**Terminal Object Fields:** `terminalName`, `globalId`, `posCardReaderType`, `printReceiptCustomer`, `printReceiptMerchant`, `terminalId`

---

## 19. Subscription Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Subscription/GetAll` | List all subscriptions | `{}` |
| `api/Subscription/Get` | Get single subscription | `{globalId}` |
| `api/Subscription/Create` | Create subscription plan | `{name, price, ...}` |
| `api/Subscription/Save` | Update subscription | `{globalId, ...}` |
| `api/Subscription/Delete` | Delete subscription | `{globalId}` |
| `api/Subscription/Activate` | Activate a subscription | `{memberId, subscriptionId}` |
| `api/Subscription/Deactivate` | Deactivate subscription | `{globalId}` |
| `api/Subscription/Cancel` | Cancel subscription | `{globalId}` |

---

## 20. Station QR Code Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/StationQr/getAll` | List all QR codes | `{}` |
| `api/StationQr/create` | Create QR code | `{stationId, ...}` |
| `api/StationQr/save` | Update QR code | `{globalId, ...}` |
| `api/StationQr/delete` | Delete QR code | `{globalId}` |

---

## 21. Report Endpoints

All report endpoints accept date ranges and return `{models: [...]}` (collections) or `{model: [...]}` (aggregates).

**Common Date Parameters:**

json

`{
  "startDate": "2026-01-01",
  "endDate": "2026-04-27",
  "pageSize": 100,
  "pageNum": 1
}`

### 21.1 Summary / Dashboard

| Endpoint | Description | Key Response |
| --- | --- | --- |
| `api/Report/Summary` | Daily/range income summary (the main dashboard) | `{model: [SummaryRow]}` |
| `api/Report/GetShifts` | List of work shifts | `{models: [ShiftObject]}` |
| `api/Report/EndOfDay` | End-of-day totals | `{model: {...}}` |
| `api/Report/EndOfShift` | End-of-shift summary | `{model: {...}}` |

**Summary Row Fields (50 fields):**`manualEntry`, `pinCode`, `rangeCardReloads`, `salesItems`, `doorTurnstile`, `tBox`, `cashierRefunds`, `bucketPurchaseCash`, `bucketPurchaseCreditCards`, `bucketPurchaseCreditCardsRefund`, `bucketPurchaseCreditCardsRetro`, `bucketPurchaseRangeCardReloads`, `bucketPurchaseRangeCardReloadsRefund`, `bucketPurchaseRangeCardReloadsRetro`, `incomeFromPOSIntegration`, `creditPurchased`, `creditUsed`, `currentTotalBalance`, `currentTotalCustomersWithBalance`, `totalBallsDispensed`, `outstandingPinCode`, `outstandingDoorPinCode`, `incomeFromMobileReloads`, `incomeFromMobileReloadsRefund`, `incomeFromMobileReloadsRetro`, `incomeFromMobileTBox`, `incomeFromMobileTBoxRefund`, `incomeFromMobileTBoxRetro`, `incomeFromMobilePincode`, `incomeFromMobilePincodeRefund`, `incomeFromMobilePincodeRetro`, `incomeFromPosCash`, `incomeFromPosCashRefund`, `incomeFromPosCashRetro`, `incomeFromPosCreditCard`, `incomeFromPosCreditCardRefund`, `incomeFromPosCreditCardRetro`, `giftCreditPurchased`, `giftCreditUsed`, `incomeFromWebPurchaseBucket`, `totalMinutesUsed`, `incomeFromSubscriptionEnrollments`, `incomeFromSubscriptionRenewals`, `currentTotalCustomersWithSubscriptions`, `incomeFromWebSalesPincodes`, `incomeFromWebSalesPincodesRefund`, `incomeFromWebSalesPincodesRetro`, `customValues`, `start`, `end`

### 21.2 Sales Reports

| Endpoint | Description |
| --- | --- |
| `api/Report/PosSales` | Sales from cashier POS |
| `api/Report/EarningsAtCashier` | Earnings processed at cashier |
| `api/Report/EarningsAtDispenser` | Earnings from dispenser stations |
| `api/Report/EarningsAtMobileApp` | Earnings from mobile app |
| `api/Report/EarningsAtVendor` | Earnings from vendor integrations |
| `api/Report/EarningsFromSubscriptions` | Subscription revenue |
| `api/Report/EarningsFromWebSales` | Web/online sales |
| `api/Report/SalesActivity` | General sales activity log |
| `api/Report/TakingsByCashier` | Cash takings per cashier |
| `api/Report/CashierCashTakings` | Cash register takings breakdown |
| `api/Report/CashLogs` | Cash transaction log |
| `api/Report/IncomeLogs` | Income transaction log |
| `api/Report/IncomeLogsByMerchantId` | Income log filtered by merchant ID |
| `api/Report/GeneralLedgerTotals` | General ledger totals by category |
| `api/Report/QuickbookExport` | QuickBooks-formatted export |

### 21.3 Balls Dispensed Reports

| Endpoint | Description |
| --- | --- |
| `api/Report/BallsDispensedByDay` | Daily ball dispensing totals |
| `api/Report/BallsDispensedByHour` | Hourly distribution of ball dispensing |
| `api/Report/BallsDispensedByWeekDay` | Day-of-week dispensing patterns |
| `api/Report/BallsDispensedByLocation` | Balls dispensed per station/location |
| `api/Report/BallsDispensedBySource` | Balls dispensed by payment source (pin, card, mobile, etc.) |
| `api/Report/DispenseSummaryCount` | Count summary of dispense events |
| `api/Report/DispenseSummaryDollars` | Dollar summary of dispense events |
| `api/Report/DispenserActivityLogs` | Full dispenser activity log |
| `api/Report/DispenserSummaryLogs` | Dispenser summary log |
| `api/Report/TotalsByDispenser` | Totals per dispenser machine |
| `api/Report/TotalsByBucketSize` | Totals grouped by bucket size/hotkey |
| `api/Report/JobExportBallsDispensed` | Export balls dispensed data (async job) |

### 21.4 Credit Card Reports

| Endpoint | Description |
| --- | --- |
| `api/Report/TotalsByCreditCardType` | Totals by card type (Visa, MC, Amex, etc.) |
| `api/Report/CreditCardVoids` | Voided credit card transactions |
| `api/Report/CardReadLogs` | Card reader activity log |
| `api/Report/cardReadLogsByMerchantId` | Card read logs filtered by merchant |

### 21.5 Member Reports

| Endpoint | Description |
| --- | --- |
| `api/Report/MemberPurchases` | Purchases made by members |
| `api/Report/MemberCategoryUsageLogs` | Member usage by category |

### 21.6 Audit & Operations

| Endpoint | Description |
| --- | --- |
| `api/Report/CashierAuditTrail` | Cashier action audit log |
| `api/Report/OrderTransactionHistory` | Full order transaction history |
| `api/Report/OrderTransactions` | Order transactions *(higher privilege required)* |
| `api/Report/OrderTransactionsByMerchantId` | Transactions by merchant ID |
| `api/Report/TerminalCashFlow` | Cash flow through payment terminals |
| `api/Report/InventoryReceiving` | Inventory receiving log |
| `api/Report/GetMoRStatus` | Merchant of Record status |
| `api/Report/SaveReportSettings` | Save report configuration |
| `api/Report/GetReportSettings` | Get report configuration |

---

## 22. Logging Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Logging/GetExceptions` | Application exception log | `{pageSize, pageNum, startDate, endDate}` |
| `api/Logging/GetProcessorLog` | Payment processor log | `{pageSize, pageNum, startDate, endDate}` |
| `api/Logging/GetStationTransactions` | Station transaction log | `{stationId, pageSize, pageNum}` |
| `api/Logging/GetStationTransactionDetails` | Detailed station transaction | `{transactionId}` |
| `api/Logging/SaleItem` | Log a sale item event | `{...}` |
| `api/Logging/ReportFix` | Trigger report data repair | `{startDate, endDate}` |
| `api/Logging/ReportFixMemberBalance` | Fix member balance records | `{memberId}` |

---

## 23. Job Runner Endpoints

Async job management for long-running export operations.

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/JobRunner/GetAll` | List all jobs | `{}` |
| `api/JobRunner/GetLogs` | Get job logs | `{jobId}` |
| `api/JobRunner/GetUrls` | Get download URLs for job outputs | `{jobId}` |
| `api/JobRunner/AnyJobsRunning` | Check if jobs are active | `{}` |
| `api/JobRunner/Cancel` | Cancel a running job | `{jobId}` |
| `api/JobRunner/Delete` | Delete job record | `{jobId}` |

---

## 24. Scheduler Endpoints

| Endpoint | Purpose | Request Body |
| --- | --- | --- |
| `api/Scheduler/GetAvailableSlots` | Get available T-Box time slots | `{date, stationId}` |
| `api/Scheduler/ReserveSlot` | Reserve a T-Box time slot | `{slotId, memberId, ...}` |
| `api/Scheduler/GetReservation` | Get a reservation | `{reservationId}` |
| `api/Scheduler/CancelReservation` | Cancel a reservation | `{reservationId}` |

---

## 25. Tenant & Admin Endpoints

*(Super-admin / multi-site management — not typically needed for single-site extension)*

| Endpoint | Purpose |
| --- | --- |
| `api/Tenant/GetTenantList` | List all tenants/sites |
| `api/Tenant/get` | Get tenant details |
| `api/Tenant/create` / `save` | Create/update tenant |
| `api/Tenant/SwitchSites` | Switch active site |
| `api/Tenant/ReindexMembers` | Rebuild member search index |
| `api/Tenant/GetApiCalls` | View API call logs |
| `api/Tenant/GetActionLogs` | View admin action logs |
| `api/Vendor/GetAll` / `create` / `save` | Vendor management |

---

## 26. Application Routes (Vue Router)

The full list of front-end routes available in the app:

| Route Path | Route Name | Description |
| --- | --- | --- |
| `/Home` | Home | Home / app launcher |
| `/Login` | Login | Authentication page |
| `/Cashier` | Cashier | POS cashier interface |
| `/PointOfSale` | PointOfSale | Full POS view |
| `/Customer-Management` | Member-Management | Member search & management |
| `/Reporting` | Reporting | Reporting dashboard |
| `/Category` | Category | Category management |
| `/Hotkeys` | Hotkeys | Hotkey configuration |
| `/Batch-PinCodes` | Batch-PinCodes | Batch pin code generation |
| `/Settings` | Settings | System settings |
| `/UserManagement` | User-Management | User administration |
| `/Inventory` | Inventory | Inventory management |
| `/Discounts` | Discounts | Discount management |
| `/MenuGroups` | Groups | Menu group configuration |
| `/TaxRates` | TaxRates | Tax rate management |
| `/Station-Management` | Station-Management | Dispenser station config |
| `/Terminal-Management` | Terminal-Management | Payment terminal config |
| `/Location-Management` | Location-Management | Location management |
| `/Station-Logs` | Station-Logs | Station activity logs |
| `/Exception-Logs` | Exception-Logs | Error/exception logs |
| `/Data-Exports` | Data-Exports | Data export tools |
| `/RefundManagement` | Refund-Management | Refund processing |
| `/StationDashboard` | Station-Dashboard | Real-time station status |
| `/VendorManagement` | Vendor-Management | Vendor integrations |
| `/CardPointeCompare` | CardPointe-Compare | CardPointe reconciliation |