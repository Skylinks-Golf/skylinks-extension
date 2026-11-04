# Changelog

Newest first. Bump `version` in `manifest.json` for any user-visible change and add a line here.

## 1.8
- Diagnostic log: tools, API calls and errors are recorded (no customer data, emails, numbers or tokens) and can be copied or downloaded from the popup's new Diagnostics section. Error messages now point to it instead of "Details in console". The popup now shows a message if a tool fails to start.

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
