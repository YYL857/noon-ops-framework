/**
 * Minimal Impex client skeleton.
 * Real category codes / payload shapes: list via impexCategoryList in your project,
 * then map each business domain to one export category.
 */
import { gatewayFetch } from "./auth.js";
import { NOON_ENDPOINTS } from "./endpoints.js";

function parseSpec(spec: string): { method: string; path: string } {
  const m = spec.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(.+)$/i);
  if (!m) return { method: "GET", path: spec };
  return { method: m[1]!.toUpperCase(), path: m[2]! };
}

async function callJson(spec: string, body?: unknown): Promise<unknown> {
  const { method, path } = parseSpec(spec);
  const res = await gatewayFetch(path, {
    method,
    headers:
      body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Impex ${method} ${path} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Discover export categories available to this partner project */
export async function listExportCategories(): Promise<unknown> {
  return callJson(NOON_ENDPOINTS.impexCategoryList);
}

/**
 * Start an async export. Exact body fields vary by category —
 * pass through what Seller Lab / docs show for your account.
 */
export async function createExport(body: Record<string, unknown>): Promise<unknown> {
  return callJson(NOON_ENDPOINTS.impexExportCreate, body);
}

export async function exportStatus(body: Record<string, unknown>): Promise<unknown> {
  return callJson(NOON_ENDPOINTS.impexExportStatus, body);
}

/**
 * Suggested domain → Impex category names (verify against listExportCategories()).
 * Names are illustrative; noon may rename — always discover at runtime.
 */
export const SUGGESTED_IMPEX_CATEGORIES = {
  catalog: ["catalogexport"],
  orders: ["ordersexport"],
  sales: ["productviewsandsalesdata"],
  fees: ["transactionviewreportonitemlevel"],
} as const;
