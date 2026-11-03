# Playwright platform · architecture

Standalone Noon portal automation (no Partner Impex). Complements Path A (API) with Path B (UI export + budget apply).

```text
python main.py <job> <cmd>
        │
        ├─ login / keepalive ─► session_sync + email OTP IMAP
        ├─ ads ui ───────────► ads-export/main.py ─► portal_bridge.deliver
        ├─ sales ui ─────────► jobs/sales.py ─────► portal_bridge.deliver
        └─ ads-budget * ─────► ads_budget/* (baseline + Live DOM)
```

## Why Playwright (not Impex)

| Domain | Impex? | Portal job |
|--------|--------|------------|
| Catalog / orders / FBN stock / TV fees | Yes | Optional |
| Ads Campaign Overview spend | Usually **no** | `ads ui` |
| Seller Lab Sales (status mix used by replenish) | Different from product-views Impex | `sales ui` |
| Live daily budget edits | Write API not used here | `ads-budget apply` |

## Auth model

1. Headed Chrome on **ads** profile → Ad Manager login (email + IMAP OTP by default).
2. Same window navigates Seller/Reports for SSO cookies.
3. Dual-write `storage_state.json` into ads + seller profile dirs.
4. Later jobs: `chromium.launch` + `storage_state=` (not persistent context).

Env: `NOON_LOGIN_EMAIL`, `NOON_LOGIN_PASSWORD`, `NOON_OTP_IMAP_*`, `NOON_OTP_AUTO` (default on).

## Shop switching

Ad Manager and Seller Lab both have a **project** chip (`PRJ…`). Automation must click the **project switcher**, not the advertiser row (`12345 | Brand`). URL already containing `project=PRJ…` with matching chip → skip switch.

Labels optional via `NOON_SHOP_LABELS=PRJ000001:DemoA,PRJ000002:DemoB`.

## Scheduling (host yourself)

Suggested wall-clock (Asia/Shanghai):

| When | Job |
|------|-----|
| ~00:10 | `ads-budget apply --mode peak` (or auto mode) |
| ~09:10 | `ads-budget apply --mode offpeak` |
| ~17:00 | `ads ui` (yesterday spend) |
| ~17:20 | `sales ui` |

Catch-up: if the machine was asleep, re-run until off-peak window ends (~16:00) / export catch minutes. **Serialize** jobs that share the ads Chromium profile.

This repo does **not** ship the private ERP Express schedulers — only the Python workers + docs.

## Out of scope here

FBN stock RPA, market-intel storefront scrapers, Feishu, ERP `state.json` auto-ingest.
