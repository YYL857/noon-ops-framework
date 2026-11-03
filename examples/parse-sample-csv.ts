/**
 * Offline demo: parse fixture portal CSVs (no credentials required).
 * Usage: npm run parse-csv
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  detectDomainFromFilename,
  parseCatalogContent,
  parseOrdersContent,
  parseSalesContent,
} from "../src/portal/parsers.js";

const root = resolve(process.cwd(), "fixtures");

const catalog = parseCatalogContent(
  readFileSync(resolve(root, "demo-catalog.csv"), "utf8"),
  "csv",
);
const sales = parseSalesContent(
  readFileSync(resolve(root, "demo-sales.csv"), "utf8"),
  "csv",
);
const orders = parseOrdersContent(
  readFileSync(resolve(root, "demo-orders.csv"), "utf8"),
  "csv",
);

console.log(
  JSON.stringify(
    {
      detect: {
        catalog: detectDomainFromFilename("demo_live.csv"),
        sales: detectDomainFromFilename("sales_export_2026-01-10.csv"),
        ads: detectDomainFromFilename("ads_sku_2026-01-01_2026-01-07.csv"),
      },
      catalogRows: catalog.length,
      catalogSample: catalog[0],
      salesRows: sales.length,
      salesSample: sales[0],
      ordersRows: orders.length,
      ordersSample: orders[0],
    },
    null,
    2,
  ),
);
