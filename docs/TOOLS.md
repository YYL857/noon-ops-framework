# Tools guide

All tools are optional. Partner/Impex examples need `NOON_CREDENTIALS_FILE`. Offline demos need no credentials.

## Partner API (Path A)

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run whoami` | credentials | Login + `/identity/v1/whoami` smoke |
| `npm run list-impex` | credentials | List Impex export categories |
| `npm run impex-export` | credentials | Create → poll → download one category (see example args) |

Library: `src/partner/` (`auth`, `impex`, `pricing`, `endpoints`).

## Portal CSV (Path B)

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run parse-csv` | fixtures only | Parse demo catalog/sales/orders CSV |

Library: `src/portal/parsers.ts` + `src/portal/ingest.ts` (hash-dedupe inbox under `NOON_PORTAL_IMPORTS_DIR`).

## Seller Lab discover

Requires Playwright + a persistent profile you logged into once:

```powershell
$env:NOON_BROWSER_PROFILE = "C:\path\to\profile"
npm run discover:nav
npm run discover:pages
npm run discover:network
```

Outputs land in `tools/discover/out/` (gitignored). Details: [tools/discover/README.md](../tools/discover/README.md).

## PW session helpers

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run session-status` | `NOON_PW_STORAGE_STATE` or profile | Cookie expiry / attention level |
| `python tools/pw-session/email_otp.py` | `NOON_OTP_IMAP_*` | Poll IMAP for Noon login OTP |

No Ad Manager budget apply scripts — those stay private.

## Storefront parse

| Command | Needs | What it does |
|---------|-------|--------------|
| `npm run parse-storefront` | fixtures only | Sold Recently / card signals + market-view summary |

Library: `src/storefront/`.
