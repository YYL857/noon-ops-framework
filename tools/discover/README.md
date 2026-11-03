# Seller Lab discovery

Inventory Noon Partner portal pages (nav links, export controls, XHR) using a Playwright persistent profile — before you design sync jobs.

## Prerequisites

1. Node ≥ 18; from repo root: `npm i` then `npx playwright install chromium`
2. A profile directory you already logged into (headed Chromium once is enough)
3. `NOON_BROWSER_PROFILE` pointing at that directory

## Commands

```powershell
$env:NOON_BROWSER_PROFILE = "C:\path\to\noon-browser-profile"
node tools/discover/discover-nav.mjs
node tools/discover/discover-pages.mjs
node tools/discover/discover-network.mjs
```

Or via npm scripts: `discover:nav` / `discover:pages` / `discover:network`.

Optional env:

- `NOON_DISCOVER_HEADLESS=1`
- `NOON_DISCOVER_MAX_PAGES=30`
- `NOON_DISCOVER_START=https://www.noon.partners/en-ae/`

## Outputs (`tools/discover/out/`)

| File | Content |
|------|---------|
| `nav.json` | Same-origin nav links + draft domain mapping |
| `pages-index.json` | Per-page status / export controls / headers |
| `pages/*.md` | Human-readable page notes |
| `screenshots/*.png` | First-viewport screenshots |
| `mapping-draft.json` | Draft Noon → domain mapping |
| `network.json` | XHR/fetch endpoints on seed pages |

If the session is dead, re-login into the same profile and re-run.
