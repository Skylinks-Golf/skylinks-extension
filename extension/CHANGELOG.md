# Changelog

Newest first. Bump `version` in `manifest.json` for any user-visible change and add a line here.

## 1.11
- Export Tee Sheet: the default date is now today in Pacific time. It used UTC, so after about 4 PM Pacific it defaulted to tomorrow.

## 1.10
- Pro Shop Orders: the page now says plainly that it doesn't fill carts yet and that staff add the items themselves, instead of pointing to Claude filling them.

## 1.9
- Pro Shop Orders: the default sales week and the "pulled at" time now use Pacific time on any computer. A Lightspeed vendor name with unusual characters no longer breaks the order page.

## 1.8
- Diagnostic log: tools, API calls and errors are recorded (row numbers and counts, not customer names, contact details, card data or tokens) and can be copied or downloaded from the popup's new Diagnostics section. Error messages now point to it instead of "Details in console". The popup now shows a message if a tool fails to start.

## 1.7
- Pro Shop Orders: four popup buttons (Last Week's Sales, Money, Ideas, This Week's Order) open the weekly order run page (`orders/`). Reads Lightspeed's new report format. Adds the `storage` permission.

## 1.6
- Save Stripe Report tool (paste CSV from the Stripe App, validate, preview, download).
- Chronogolf fixes.

## Earlier
- Lightspeed Retail customer type sync.
- SelectPi daily snapshot with comparative data.
- Extension hardening: shared `content/core/` modules, preflight checks, platform config.
- See `docs/DEVLOG.md` and git history for detail.
