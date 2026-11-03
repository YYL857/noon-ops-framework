# Dynamic ads budget (peak / off-peak)

Automatically lowers **Live daily budget** in Ad Manager during low-traffic hours and restores a human baseline at night (Asia/Shanghai).

## Time windows (CST / UTC+8)

| Mode | Clock | Action |
|------|-------|--------|
| `offpeak` | 09:00 ≤ t < 16:00 | Set Live budget → `offpeakBudget` or floor **5** |
| `peak` | 00:00 ≤ t < 05:00 | Restore `baselineBudget` |
| `idle` | otherwise | No change |

Pure math: `ads_budget/windows.py` (unit-tested). Override floor via row fields, not code forks.

## Data: baseline.csv

Per shop:

```text
{NOON_DATA_ROOT}/shops/{shopId}/ads-budget/baseline.csv
```

Typical columns (see `baseline_store.py`): campaign id/name, `baselineBudget` (peak target), `offpeakBudget` (optional), `lastSeenBudget`, enabled flags, timestamps.

Workflow:

1. **`sync`** — scrape Live campaigns (scroll + pagination), update `lastSeen*` only.
2. **`sync --refresh-baseline`** — during peak hours (human-set Live values), copy Live → `baselineBudget`.
3. **`apply`** — for each enabled row, compute target for current (or `--mode`) window; batch-edit Live budgets.

```powershell
$env:NOON_ADS_BUDGET_SHOPS="PRJ000001,PRJ000002"   # required — no defaults
python main.py ads-budget probe
python main.py ads-budget sync
python main.py ads-budget sync --refresh-baseline
python main.py ads-budget apply --dry-run
python main.py ads-budget apply
python main.py ads-budget apply --mode offpeak --only-failed
```

## Safety rules

- **Whitelist required** (`NOON_ADS_BUDGET_SHOPS`). Empty → hard error.
- Shops sharing the ads Chromium profile run **serially**.
- Prefer `--dry-run` after UI changes on Noon.
- `last_run.json` + JSONL run logs under shop dir / `NOON_LOG_DIR` for audit.
- This **writes** to Ad Manager. Treat credentials and baselines as secrets.

## Tunables

| Env | Default | Meaning |
|-----|---------|---------|
| `NOON_ADS_BUDGET_BATCH` | 15 | Campaigns per apply batch |
| `NOON_ADS_BUDGET_SCROLL_ROUNDS` | (code default) | Infinite-scroll scrape depth |
| `NOON_ADS_BUDGET_MAX_PAGES` | (code default) | Pagination cap when Next exists |
| `NOON_ADS_BUDGET_TRIGGER` | manual | Tag for logs (`schedule:peak`, …) |

## Suggested host schedule

- ~00:10 apply peak  
- ~09:10 apply offpeak  
- Catch-up if machine was offline until ~16:00 offpeak end  

Keep scheduling in your process supervisor; this package is the worker.
