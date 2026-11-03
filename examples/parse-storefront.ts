/**
 * Offline demo: extract products + market-view summary from fixture JSON.
 * Usage: npm run parse-storefront
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  computeMarketViewSummary,
  extractProductsFromPayload,
  safeAnchorFileKey,
} from "../src/storefront/index.js";

const payload = JSON.parse(
  readFileSync(resolve(process.cwd(), "fixtures/demo-products.json"), "utf8"),
);
const products = extractProductsFromPayload(payload, { topN: 20 });
const competitors = products.map((p) => ({
  productKey: p.productKey,
  title: p.title,
  url: p.url ?? undefined,
  price: p.price,
  soldRecently: p.soldRecently,
}));
const ownPrice = 189;
const summary = computeMarketViewSummary(competitors, ownPrice);

console.log(
  JSON.stringify(
    {
      anchorKey: safeAnchorFileKey("NDEMO001"),
      productCount: products.length,
      products,
      summary,
    },
    null,
    2,
  ),
);
