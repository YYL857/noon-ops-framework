# Noon Ops Framework

**Dual-path Noon seller kit + practical tools** — Partner API Impex, portal CSV parsers, Playwright **ads/sales export**, **peak/off-peak ads budget apply**, Seller Lab discovery, session helpers, and storefront parse. Not a SaaS.

[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Status](https://img.shields.io/badge/status-v0.3%20beta-orange.svg)](#)
[![Focus](https://img.shields.io/badge/focus-ops%20workers%20included-brightgreen.svg)](#)
[![Node](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](./package.json)

Repo: [github.com/YYL857/noon-ops-framework](https://github.com/YYL857/noon-ops-framework)

---

## What you get

> **Path A:** whatever Partner API / Impex can export.  
> **Path B:** portal CSV (Playwright or manual) → per-shop `portal-imports` → your store.  
> **Workers:** ads spend export, sales export, peak/off-peak Live budget apply.

| Piece | Role |
|-------|------|
| Partner auth + Impex | Service Account → RS256 JWT → gateway cookie; create → poll → download CSV |
| Pricing overlay helper | Offer/live price reads via Partner API (no Impex quota) |
| Portal parsers | Catalog / orders / stock / sales / fees / ads CSV → typed rows |
| **PW platform** | `tools/pw-platform` — ads/sales export + ads-budget apply (shop IDs via env only) |
| Seller Lab discover | Playwright nav / page / network inventory |
| PW session helpers | IMAP OTP fetch + `storage_state` cookie health |
| Storefront parse | Sold Recently / card signals + market-view summary helpers |
| Domain map | catalog / stock / orders / sales / fees / ads — do not mash into one “SKU god table” |

**Not in this repo:** real credentials, *your* shop IDs, production CSV, or a full ERP. Budget apply is included but **opt-in** (whitelist env + `--dry-run`). See [docs/SECURITY.md](./docs/SECURITY.md).

---

## Why it exists

| Common trap | This kit |
|-------------|----------|
| Scraping noon.com storefront as “ERP truth” | Ops master data via **Partner API / Impex**; storefront is intel only |
| Expecting a complete public Seller SDK | Official surface is still early — use **Service Account JWT + cookie** |
| Forcing ads through the same Impex path | **Ads often have no Impex** → portal export / RPA → `portal-imports` |
| Copying another site’s fee rules | Prefer **Transaction View** actuals; recalibrate thresholds per shop |
| Day-one stock/price API push | Stock/pricing Partner write-back still phase two; **ads Live budget** worker is shipped separately |

---

## Architecture

```
                    ┌─────────────────────────────┐
   Service Account  │  Path A · Partner API       │
   JSON (you keep) ─►│  Impex async CSV export     │──┐
                    │  whoami / pricing helpers   │  │
                    └─────────────────────────────┘  │
                                                     ▼
                                              ┌──────────────┐
                                              │ Domain store │
                                              │ (your app)   │
                                              └──────────────┘
                                                     ▲
                    ┌─────────────────────────────┐  │
   Manual / RPA CSV │  Path B · Portal export     │  │
   ─────────────────►│  portal-imports + parsers   │──┘
                    │  idempotent ingest          │
                    └─────────────────────────────┘

   Extra: pw-platform (ads/sales/budget) · discover · OTP · storefront parse
```

**Rule: one source per domain, one primary store per domain.** Catalog may *reference* stock / sales / fees — it is not their source of truth.

Domain map: [docs/DOMAIN_MAP.md](./docs/DOMAIN_MAP.md). Tools: [docs/TOOLS.md](./docs/TOOLS.md).  
PW workers: [docs/PW_PLATFORM.md](./docs/PW_PLATFORM.md) · [ADS_EXPORT](./docs/ADS_EXPORT.md) · [SALES_EXPORT](./docs/SALES_EXPORT.md) · [ADS_BUDGET](./docs/ADS_BUDGET.md).

---

## Quick start

```bash
cp examples/.env.example .env
# Point NOON_CREDENTIALS_FILE at your Access App Service Account JSON (private path)

npm install
npm run parse-csv          # offline fixtures — no credentials
npm run parse-storefront   # offline fixtures
npm run whoami             # needs credentials
```

Requires **Node ≥ 18**. Never commit the JSON key file.

Optional Playwright (discover):

```bash
npm i -D playwright
npx playwright install chromium
# set NOON_BROWSER_PROFILE then: npm run discover:nav
```

---

## Layout

```
src/partner/          auth, endpoints, Impex, pricing
src/portal/           CSV parsers + hash ingest
src/storefront/       Sold Recently / market-view helpers
tools/pw-platform/    ads + sales export + ads-budget (Python/Playwright)
tools/discover/       Seller Lab page/network inventory
tools/pw-session/     lightweight OTP / session-status helpers
examples/             whoami, impex, parse demos
fixtures/             DEMO SKUs only
docs/                 DOMAIN_MAP · SECURITY · TOOLS · PW_* guides
```

Compatibility shims: `src/auth.ts`, `src/impex.ts`, `src/ingest.ts` re-export the new modules.

---

## Write-back

| Surface | In this repo? |
|---------|----------------|
| Ad Manager **Live daily budget** (peak/off-peak) | Yes — `tools/pw-platform` ads-budget (`--dry-run` first) |
| Partner `stock-update` / `pricing/upsert` | Documented only — enable in your private ops repo |

---

## Playwright quick start

```powershell
cd tools/pw-platform
pip install -r requirements.txt
playwright install chromium
# set NOON_DATA_ROOT, NOON_SHOPS, login + IMAP env — see tools/pw-platform/README.md
python main.py login
python main.py ads ui
python main.py sales ui
python main.py ads-budget apply --dry-run
```

---

## Fit / not a fit

**Fit:** teams building a Noon ERP/OMS or data warehouse; integrators merging Partner API + portal CSV; sellers who refuse to treat front-page scrape as master data.

**Not a fit:** Noon Payments only; “one-click” auto-bid / auto-price robots expecting this repo to mutate live ads.

---

## License

[MIT](./LICENSE). Patterns come from production multi-shop Noon practice; nothing in this public tree is tied to a real shop’s data.
