# Noon Playwright ops platform

Production-proven Playwright jobs for Noon **Ad Manager** and **Seller Lab**:

| Job | What it does |
|-----|----------------|
| `ads` | Export Campaign Overview → normalized `ads_sku_{from}_{to}.csv` → per-shop `portal-imports` |
| `sales` | Seller Lab Sales deep-link export → clean Delivered/Processing/Shipped → `sales_export_*.csv` |
| `ads-budget` | Peak / off-peak **Live daily budget** apply (CST windows) with baseline CSV |
| `keepalive` / `login` | Unified OTP login; dual-write `storage_state` for ads + seller profiles |

This package is **shop-agnostic**. You supply project codes via env (`NOON_SHOPS`, `NOON_ADS_BUDGET_SHOPS`). No real shop IDs ship in source.

Related English docs:

- [docs/PW_PLATFORM.md](../../docs/PW_PLATFORM.md) — architecture & ops
- [docs/ADS_EXPORT.md](../../docs/ADS_EXPORT.md) — ads spend export
- [docs/SALES_EXPORT.md](../../docs/SALES_EXPORT.md) — sales export
- [docs/ADS_BUDGET.md](../../docs/ADS_BUDGET.md) — dynamic budget windows

## Setup

```powershell
cd tools/pw-platform
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium
# Chrome channel is default (NOON_ADS_PW_CHANNEL=chrome)
```

Copy env template from repo root `examples/.env.example` and set at least:

```text
NOON_DATA_ROOT=./data
NOON_SHOPS=PRJ000001,PRJ000002
NOON_ADS_BUDGET_SHOPS=PRJ000001,PRJ000002
NOON_LOGIN_EMAIL=...
NOON_LOGIN_PASSWORD=...
NOON_OTP_IMAP_HOST=...
NOON_OTP_IMAP_USER=...
NOON_OTP_IMAP_PASS=...
```

## Commands

```powershell
# One headed login (writes storage_state for ads + seller profiles)
python main.py login

# Soft session probe
python main.py keepalive soft

# Ads spend export (default range: yesterday)
$env:NOON_ADS_RANGE="yesterday"
python main.py ads ui

# Sales export (lookback via NOON_SALES_LOOKBACK_DAYS or FROM/TO)
python main.py sales ui

# Budget: scrape Live → update lastSeen; optional refresh baseline
python main.py ads-budget sync
python main.py ads-budget sync --refresh-baseline   # human peak targets from Live

# Budget: apply current CST mode (or force)
python main.py ads-budget apply
python main.py ads-budget apply --mode offpeak --dry-run
python main.py ads-budget apply --mode peak
python main.py ads-budget probe
```

## Profiles & locking

| Profile env | Default under `NOON_DATA_ROOT` | Used by |
|-------------|-------------------------------|---------|
| `NOON_ADS_PW_PROFILE` | `browser-profiles/noon-ads-pw` | ads, ads-budget, login |
| `NOON_SELLER_PW_PROFILE` | `browser-profiles/noon-seller-pw` | sales, login |

Exports use **launch + storage_state**, not persistent context (avoids profile fights).  
**Same Chromium profile must run serially** (ads ∥ ads-budget forbidden). Sales can run beside ads (different profile).

## Landing layout

```text
{NOON_DATA_ROOT}/
  browser-profiles/noon-ads-pw/storage_state.json
  browser-profiles/noon-seller-pw/storage_state.json
  downloads/{shopId}/…
  exports/ads/{shopId}/ads_sku_*.csv
  shops/{shopId}/portal-imports/ads_sku_*.csv
  shops/{shopId}/portal-imports/sales_export_*.csv
  shops/{shopId}/ads-budget/baseline.csv
  shops/{shopId}/ads-budget/last_run.json
  logs/
```

Downstream ERP ingest is **your** responsibility; this kit stops at portal-imports.

## Safety

- Never commit `storage_state.json`, IMAP passwords, or real baseline CSVs with live spend.
- Budget apply **mutates** Ad Manager Live daily budgets — use `--dry-run` first.
- Whitelists are required env vars; empty list raises (no silent “default shops”).
