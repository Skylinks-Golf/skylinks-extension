# Skylinks Extension Repo

The home for Skylinks Golf's browser tools and shared Claude Artifacts.

| Folder | What it is |
|---|---|
| [`extension/`](extension/) | **Skylinks Tools**, the Chrome extension for pro-shop and admin staff. The only Skylinks Chrome extension. |
| [`artifacts/`](artifacts/) | Shared claude.ai Artifacts (hosted pages). See [artifacts/README.md](artifacts/README.md). |

## Install the extension (staff)

1. Get this repo (clone it, or download it as a ZIP and unzip it).
2. In Chrome, open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select the **`extension/`** folder (not the repo root).
4. Pin **Skylinks Tools** to the toolbar.

To update: pull the latest, then click the reload icon on the extension card in `chrome://extensions`.

## What the tools do

Open the extension on one of these sites and its buttons appear.

| Site | Tools |
|---|---|
| Lightspeed Retail (`us.merchantos.com`) | Daily Snapshot Report, Sales Lines Report, Sync Customer Type |
| Lightspeed Golf (Chronogolf) | Import Customers, Export Tee Sheet |
| SelectPi portal | Daily Snapshot Report, Weekly Earnings Report |
| Perfect Venue | Weekly Analytics Report |
| Deputy | Weekly Hours Report |
| Stripe dashboard | Save Stripe Report |

## Something went wrong?

1. Click the **Skylinks Tools** icon, scroll to **Diagnostics**, and press **Copy log**.
2. Paste it into your message to Ian (or into Claude when you are asking it to fix the problem). Use **Download** if it is too long to paste.
3. Tell us what you clicked and on which page.

The log holds the last 500 events: which tool ran, which requests failed, row numbers, and error messages. Tools are written to leave out customer names, emails, phone numbers, card numbers and passwords, and a filter removes those patterns as a backup. An error message from a vendor can still contain something the filter doesn't recognize, so **glance over the log before you send it**. It stays in your browser until you copy it. **Clear** empties it.

## Contributing

- Work on a `<initials>/<topic>` branch and open a pull request. Never push to `main`.
- Never commit secrets, card data, payroll, or customer/member PII, including "example" exports. Use made-up sample data.
- Developers and AI agents: read [AGENTS.md](AGENTS.md) first. See [extension/CHANGELOG.md](extension/CHANGELOG.md) for release notes.
