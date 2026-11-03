# Security · public boundary

## Never commit

- Service Account JSON (includes `private_key`)
- Browser `storage_state` / cookies / session files
- **Your real** `PRJ…` project codes, Partner IDs, warehouse IDs, offer codes
- Production CSV, settlements, customer addresses, baseline budgets with live spend
- LAN IPs, office machine paths, third-party RPA account IDs
- IMAP passwords / mailbox addresses

## Recommended practice

- Credentials and shop lists **only** via env (`NOON_CREDENTIALS_FILE`, `NOON_SHOPS`, `NOON_ADS_BUDGET_SHOPS`, `NOON_OTP_IMAP_*`, profile paths)
- `.gitignore` covers `.env`, `*.sensitive.json`, `data/**`, discover `out/`, `storage_state*.json`
- Fixtures use `DEMO-SKU-001` / placeholder `PRJ000001` in docs only
- Redact shop names and GMV in screenshots

## What this repo ships

**Included (you opt in with env):**

- Partner API login + Impex download
- Portal CSV parsers + ingest contract
- Playwright **ads spend export** and **sales export**
- Playwright **Ad Manager Live daily budget** peak/off-peak apply (`--dry-run` supported)
- Seller Lab discovery, OTP IMAP helper, storefront parse

**Still not shipped:**

- Partner API stock/pricing write-back as an enabled worker
- Full ERP `state.json` auto-ingest / admin HTTP façade
- Any real shop whitelist or production baselines

Budget apply **does mutate** Ad Manager when you run it without `--dry-run`. Treat it like production change control.
