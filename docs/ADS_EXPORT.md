# Ads spend export (Ad Manager)

Exports **Campaign Overview** from [admanager.noon.partners](https://admanager.noon.partners) into a stable CSV your warehouse can ingest.

## Pipeline

```text
Ad Manager UI export (xlsx)
  → {NOON_DATA_ROOT}/downloads/{shopId}/{shopId}_campaigns-export_{from}_{to}.xlsx
  → normalize columns (sku, campaign_name, spend, revenue, orders, views, clicks, atc, dates)
  → {NOON_DATA_ROOT}/exports/ads/{shopId}/ads_sku_{from}_{to}.csv
  → copy → shops/{shopId}/portal-imports/ads_sku_{from}_{to}.csv
```

Entry points:

```powershell
cd tools/pw-platform
$env:NOON_SHOPS="PRJ000001,PRJ000002"
$env:NOON_ADS_RANGE="yesterday"   # or today|last7|last30|days|custom + FROM/TO
python main.py ads ui
```

Implementation: `ads-export/main.py` (UI automation) + `lib/portal_bridge.py` (xlsx→csv + deliver).

## Date range (`NOON_ADS_RANGE`)

| Value | Meaning |
|-------|---------|
| `yesterday` (default) | from = to = yesterday |
| `today` | today only |
| `last7` / `last30` / `last90` | rolling windows including today |
| `ytd` | Jan 1 → today |
| `days` | `NOON_ADS_DAYS` (default 7) |
| custom | set both `NOON_ADS_FROM` and `NOON_ADS_TO` (`YYYY-MM-DD`) |

## Multi-shop

`NOON_SHOPS` is required (comma-separated project codes). Jobs switch project in Ad Manager, export, deliver **per shop** — never write a global shared CSV that mixes shops.

## Auth recovery

If export hits login wall:

1. Preflight checks ads profile SSO cookies.
2. Optional in-window OTP autofill (`NOON_OTP_AUTO`).
3. Job-level retry via unified `session_sync` login, then re-run export once.

Headless is fragile on Noon — first login should be headed (`NOON_ADS_PW_HEADLESS=0`).

## Normalized CSV columns

`sku, campaign_name, from_date, to_date, spend, revenue, orders, views, clicks, atc`

Spend / revenue are numeric strings as scraped; your ERP should coerce currencies separately.
