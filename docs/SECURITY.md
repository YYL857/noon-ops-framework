# Security · public boundary

## Never commit

- Service Account JSON (includes `private_key`)
- Browser `storage_state` / cookies / session files
- Real `project_code`, Partner ID, warehouse ID, offer codes
- Production CSV, settlements, customer addresses
- LAN IPs, office machine paths, RPA vendor account IDs

## Recommended practice

- Credentials only via env (`NOON_CREDENTIALS_FILE`, `NOON_OTP_IMAP_*`, `NOON_BROWSER_PROFILE`)
- `.gitignore` covers `.env`, `*.sensitive.json`, `portal-imports/**`, `data/**`, discover `out/`
- Examples and fixtures use `YOUR_PROJECT` / `DEMO-SKU-001` only
- Redact shop names and GMV in any public screenshots

## What this repo ships

**Read / discover / session-helper oriented:**

- Partner API login + Impex export download
- Portal CSV parsers + hash-deduped inbox contract
- Seller Lab Playwright discovery
- IMAP OTP fetch + `storage_state` cookie health
- Storefront card / market-view parse helpers

**Not shipped as enabled write-back:**

- Live stock update, pricing upsert, Ad Manager budget mutation
- Full ERP auto-ingest into a private `state.json`

Those belong in a private ops repo with audit logs and SKU allowlists. This kit documents the read path so you can build your own write stage later.
