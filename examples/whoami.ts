/**
 * Smoke test: login with Service Account and print whoami.
 * Usage: set NOON_CREDENTIALS_FILE then `npm run whoami`
 */
import { loadEnv } from "./load-env.js";
import { gatewayFetch } from "../src/auth.js";

loadEnv();

const res = await gatewayFetch("/identity/v1/whoami");
const text = await res.text();
if (!res.ok) {
  console.error("whoami failed", res.status, text.slice(0, 500));
  process.exit(1);
}
const data = JSON.parse(text) as Record<string, unknown>;
// Print only non-sensitive keys if present
const safe = {
  ok: true,
  keys: Object.keys(data),
  project_hint: typeof data.project_code === "string" ? "(present)" : undefined,
};
console.log(JSON.stringify(safe, null, 2));
console.log(
  "Login works. Avoid logging the full whoami payload in shared channels.",
);
