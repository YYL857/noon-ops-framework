/**
 * Noon Partner API paths (see https://noon-docs.noonpartners.dev/).
 * Live sync uses noon-api-gateway — not the Seller Lab HTML portal.
 */

export const NOON_API_GATEWAY =
  process.env.NOON_API_BASE?.trim() ||
  "https://noon-api-gateway.noon.partners";

export const NOON_ENDPOINTS = {
  apiLogin: "POST /identity/public/v1/api/login",
  whoami: "GET /identity/v1/whoami",
  impexCategoryList: "GET /impex/v1/export/category/list",
  impexExportCreate: "POST /impex/v1/export/create",
  impexExportStatus: "POST /impex/v1/export/status",
  /** Optional write APIs — enable only after read-path is stable */
  pricingUpsert: "POST /pricing/v1/pricing/upsert",
  stockUpdate: "POST /stock/v1/stock-update",
  getStock: "GET /stock/v1/stock",
} as const;

export type NoonEndpointKey = keyof typeof NOON_ENDPOINTS;
