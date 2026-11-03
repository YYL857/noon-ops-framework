/**
 * Live Impex create → poll → download (uses NOON_CREDENTIALS_FILE).
 * Default category: catalog. Override with IMPEX_CATEGORY / IMPEX_DAYS.
 *
 * Usage: npm run impex-export
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "./load-env.js";
import {
  IMPEX_EXPORT_CATEGORIES,
  impexDateRangeDays,
  runImpexExportCsv,
} from "../src/partner/impex.js";

loadEnv();

const key = (process.env.IMPEX_CATEGORY?.trim() || "catalog") as keyof typeof IMPEX_EXPORT_CATEGORIES;
const category =
  IMPEX_EXPORT_CATEGORIES[key] ?? process.env.IMPEX_CATEGORY?.trim();
if (!category) {
  console.error("Unknown IMPEX_CATEGORY. Keys:", Object.keys(IMPEX_EXPORT_CATEGORIES));
  process.exit(1);
}

const days = Math.max(1, Number(process.env.IMPEX_DAYS ?? 7));
const params =
  key === "sales" || key === "orders" || key === "fees"
    ? impexDateRangeDays(days)
    : undefined;

console.log("Starting Impex", { key, category, params });
const { exportCode, csv, category: resolved } = await runImpexExportCsv(
  category,
  params,
);
const out = resolve(
  process.cwd(),
  "data",
  `impex-${key}-${exportCode.slice(0, 8)}.csv`,
);
writeFileSync(out, csv, "utf8");
console.log(
  JSON.stringify(
    {
      ok: true,
      exportCode,
      category: resolved,
      bytes: csv.length,
      out,
      hint: "CSV written under ./data (gitignored). Parse with portal parsers.",
    },
    null,
    2,
  ),
);
