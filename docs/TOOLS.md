# Tools guide

All tools are optional. Partner/Impex examples need `NOON_CREDENTIALS_FILE`. Offline demos need no credentials. Playwright workers need login + shop env.

## Partner API (Path A)

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run whoami` | credentials | Login + `/identity/v1/whoami` smoke |
| `npm run list-impex` | credentials | List Impex export categories |
| `npm run impex-export` | credentials | Create → poll → download one category |

Library: `src/partner/`.

## Portal CSV parsers

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run parse-csv` | fixtures only | Parse demo catalog/sales/orders CSV |

Library: `src/portal/`. After Playwright lands files under `shops/{id}/portal-imports`, point your ingest at those paths.

## Playwright platform (ads / sales / budget)

Full guide: [tools/pw-platform/README.md](../tools/pw-platform/README.md).

```powershell
cd tools/pw-platform
python main.py login
python main.py ads ui          # Campaign Overview → ads_sku_*.csv
python main.py sales ui        # Seller Lab Sales → sales_export_*.csv
python main.py ads-budget apply --dry-run
```

Docs: [PW_PLATFORM.md](./PW_PLATFORM.md) · [ADS_EXPORT.md](./ADS_EXPORT.md) · [SALES_EXPORT.md](./SALES_EXPORT.md) · [ADS_BUDGET.md](./ADS_BUDGET.md).

Required env (no baked-in shops): `NOON_DATA_ROOT`, `NOON_SHOPS`, and for budget `NOON_ADS_BUDGET_SHOPS`.

## Seller Lab discover

```powershell
$env:NOON_BROWSER_PROFILE = "C:\path\to\profile"
npm run discover:nav
```

## Lightweight session helpers

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run session-status` | storage_state path | Cookie expiry / attention level |
| `python tools/pw-session/email_otp.py` | IMAP env | Poll for Noon OTP |

(OTP is also embedded inside `tools/pw-platform` for full login.)

## Storefront parse

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run parse-storefront` | fixtures | Sold Recently / market-view summary |
