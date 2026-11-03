/**
 * Noon Partner API paths (see https://noon-docs.noonpartners.dev/).
 * Live sync uses noon-api-gateway — not the Seller Lab HTML portal.
 */

export const NOON_API_GATEWAY =
  process.env.NOON_API_BASE?.trim() ||
  "https://noon-api-gateway.noon.partners";

export const NOON_ENDPOINTS = {
  /** Service Account JWT → session Cookie */
  apiLogin: "POST /identity/public/v1/api/login",
  /** Validate current session */
  whoami: "GET /identity/v1/whoami",
  /** Impex async export (catalog / orders / FBN inventory / …) */
  impexCategoryList: "GET /impex/v1/export/category/list",
  impexExportCreate: "POST /impex/v1/export/create",
  impexExportStatus: "POST /impex/v1/export/status",
  /** Offer price (My Catalog display price; does not use Impex quota) */
  offerProduct: "GET /offer/v1/product/{partner_sku}",
  /** Reference REST paths — current read path prefers Impex CSV */
  ordersList: "GET /fbpi/v1/orders",
  stockGet: "GET /stock/v1/stock",
  catalogList: "GET /content/v1/products",
  getContent: "POST /content/v1/product/content/get",
  /** Optional write APIs — enable only after the read path is stable */
  pricingUpsert: "POST /pricing/v1/pricing/upsert",
  stockUpdate: "POST /stock/v1/stock-update",
} as const;

export type NoonEndpointKey = keyof typeof NOON_ENDPOINTS;
