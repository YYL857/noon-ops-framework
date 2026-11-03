# Sales export (Seller Lab Reports)

Exports the **portal Sales** report (not Impex `productviewsandsalesdata`). Use this when you need the same status mix operators see in Seller Lab.

## Pipeline

```text
Deep-link Reports Sales
  ?project={shopId}&from_date=&to_date=
  → Export → wait download
  → keep rows: Delivered / Processing / Shipped (drop others)
  → shops/{shopId}/portal-imports/sales_export_{from}_{to}.csv
```

**Do not click the Status filter in the UI** — the deep-link + post-clean is the stable approach.

```powershell
cd tools/pw-platform
$env:NOON_SHOPS="PRJ000001"
# Option A: lookback days (inclusive window ending today)
$env:NOON_SALES_LOOKBACK_DAYS="30"
# Option B: explicit range
# $env:NOON_SALES_FROM="2026-01-01"; $env:NOON_SALES_TO="2026-01-31"
python main.py sales ui
```

Uses **seller** Chromium profile (`NOON_SELLER_PW_PROFILE`). Can run in parallel with ads export (different profile).

## Why not Impex alone

Impex product-views/sales is a different grain/status set. Replenish and finance workflows that were calibrated on portal CSV should keep using this exporter.

## File naming

`sales_export_{from}_{to}.csv` under each shop’s `portal-imports`. Filename dates drive auto-detect in `src/portal/parsers.ts` (`detectDomainFromFilename`).

## Failure tips

| Symptom | Likely fix |
|---------|------------|
| Login / SSO wall | `python main.py login` then retry |
| Empty download | Widen timeout; confirm project chip; check Downloads + `NOON_DATA_ROOT/downloads` |
| Wrong shop rows | Ensure `ensure_shop` ran; URL must contain `project=` |
