# Skylinks Artifacts

This folder holds shared claude.ai Artifacts (hosted HTML pages) that the Skylinks team builds together. They sit alongside the Skylinks Tools extension. The extension itself stays at the repo root and is not affected by anything in this folder.

## Layout

```
artifacts/
  <slug>/
    index.html   # the page source — the Artifact is published from this exact file
    README.md    # purpose, owner, Artifact URL, data sources
```

| Slug | Artifact | Owner |
|---|---|---|
| `order-run` | [Pro Shop Order Run](https://claude.ai/artifact/A46JNVDxUR84mEGpHv8Ujq) | LC |

## Workflow

1. **Pull first.** Before starting, pull the repo and check whether an artifact for the task already exists.
2. **The repo file is the source.** Edit `artifacts/<slug>/index.html`, then publish the claude.ai Artifact from that same file. If someone edited the published page directly, merge their changes back into the file before you publish.
3. **Branch and open a PR.** Name branches `<initials>/<slug>-<change>` (for example `lc/order-run-week-nov-9`). Open a PR for every change and never push to `main`. Agents commit or push only when asked.
4. **Content rules.** `index.html` is the page body only: start at `<title>` and leave out doctype, html, head and body tags, because the Artifact tool adds them at publish time. Put everything inline (CSS, JS, and images as data: URLs). The only external resource allowed is Google Fonts.
5. **House style.** Black header, white logo, thick gold rule, Montserrat, `#eeb02b` used for accents only, square corners, clean tables.

## Never commit

Never commit secrets, API keys or passwords, card data, payroll, customer PII, or signed waivers and incident records. If live numbers are sensitive, keep them out of the repo and load them at runtime.
