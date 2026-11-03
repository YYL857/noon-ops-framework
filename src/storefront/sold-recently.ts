/**
 * Parse Noon storefront card signals (Sold Recently, ads, bestseller).
 * Works on JSON payloads from browser extensions or scrapers — no ERP host.
 */

function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v)))
    return Number(v);
  return null;
}

/** Parse "80+" / "2.6K" / "80+ Sold Recently" → number */
export function parseSoldRecentlyCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0)
    return Math.round(raw);
  if (typeof raw !== "string" || !raw.trim()) return null;
  const m = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([KkMm])?/);
  if (!m) return null;
  let n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const u = (m[2] || "").toUpperCase();
  if (u === "K") n *= 1000;
  if (u === "M") n *= 1_000_000;
  return Math.round(n);
}

export type CardSignals = {
  soldRecently: number | null;
  soldRecentlyText: string | null;
  isBestSeller: boolean;
  isAd: boolean;
};

export function pickListSignals(obj: Record<string, unknown>): CardSignals {
  const text =
    (typeof obj.soldRecentlyText === "string" && obj.soldRecentlyText) ||
    (typeof obj.sold_recently_text === "string" && obj.sold_recently_text) ||
    null;
  const tagPool = [
    ...(Array.isArray(obj.cardTags) ? obj.cardTags : []),
    ...(Array.isArray(obj.tags) ? obj.tags : []),
  ]
    .map((t) => String(t || ""))
    .filter(Boolean);
  const tagSold =
    tagPool.find((t) => /sold\s+recently/i.test(t)) ||
    tagPool.find((t) => /\d[\d.,]*\s*[KkMm]?\+?\s*sold/i.test(t)) ||
    null;
  const soldRecently =
    parseSoldRecentlyCount(obj.soldRecently) ??
    parseSoldRecentlyCount(obj.sold_recently) ??
    parseSoldRecentlyCount(text) ??
    parseSoldRecentlyCount(tagSold);
  return {
    soldRecently,
    soldRecentlyText:
      text ??
      (typeof tagSold === "string" && /sold/i.test(tagSold) ? tagSold : null) ??
      (soldRecently != null ? `${soldRecently}+ Sold Recently` : null),
    isBestSeller: Boolean(obj.isBestSeller || obj.is_best_seller),
    isAd: Boolean(obj.isAd || obj.is_ad || obj.sponsored),
  };
}

export type StorefrontProduct = {
  productKey: string;
  title: string;
  url: string | null;
  price: number | null;
  brand: string | null;
  soldRecently: number | null;
  soldRecentlyText: string | null;
  isBestSeller: boolean;
  isAd: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

const PRODUCT_URL_RE =
  /https?:\/\/(?:www\.)?noon\.com\/(?:saudi-en|saudi-ar|uae-en|uae-ar)\/([^/?#"']+)\/([A-Za-z0-9]{6,})\/p\//i;

function titleFromSlug(slug: string): string {
  try {
    return decodeURIComponent(slug)
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 240);
  } catch {
    return slug.replace(/-/g, " ").replace(/\s+/g, " ").trim().slice(0, 240);
  }
}

function normalizeProductUrl(
  url: string | null,
  productKey: string,
  baseUrl: string,
): string | null {
  if (!url) return `${baseUrl.replace(/\/$/, "")}/${productKey}/p/`;
  if (/nooncdn\.com/i.test(url) || /\/p\/pzsku\//i.test(url)) return null;
  const m = PRODUCT_URL_RE.exec(url);
  if (m) return `https://www.noon.com/saudi-en/${m[1]}/${m[2]}/p/`;
  if (url.startsWith("http") && /noon\.com/i.test(url) && /\/p\//i.test(url))
    return url.split("#")[0]!;
  if (!url.startsWith("http")) {
    return `${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`;
  }
  return `${baseUrl.replace(/\/$/, "")}/${productKey}/p/`;
}

/** Walk JSON (extension / scraper payload) and collect product cards. */
export function extractProductsFromPayload(
  payload: unknown,
  opts: {
    baseUrl?: string;
    topN?: number;
  } = {},
): StorefrontProduct[] {
  const baseUrl = opts.baseUrl ?? "https://www.noon.com/saudi-en";
  const topN = opts.topN ?? 40;
  const found: StorefrontProduct[] = [];
  const seen = new Set<string>();

  const visit = (node: unknown, depth: number) => {
    if (found.length >= topN || depth > 12 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const obj = asRecord(node);
    if (!obj) return;

    const sku =
      (typeof obj.sku === "string" && obj.sku) ||
      (typeof obj.offer_code === "string" && obj.offer_code) ||
      (typeof obj.offerCode === "string" && obj.offerCode) ||
      (typeof obj.catalog_sku === "string" && obj.catalog_sku) ||
      (typeof obj.productKey === "string" && obj.productKey) ||
      null;
    let title =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.title === "string" && obj.title) ||
      (typeof obj.product_title === "string" && obj.product_title) ||
      null;
    const urlPath =
      (typeof obj.url === "string" && obj.url) ||
      (typeof obj.slug === "string" && obj.slug) ||
      (typeof obj.product_url === "string" && obj.product_url) ||
      null;

    if (sku && (title || urlPath)) {
      let productKey = String(sku).replace(/[^\w.-]+/g, "_").slice(0, 120);
      const urlHit = urlPath ? PRODUCT_URL_RE.exec(urlPath) : null;
      if (urlHit) {
        productKey = urlHit[2]!.replace(/[^\w.-]+/g, "_").slice(0, 120);
        if (!title || title === sku || title === productKey)
          title = titleFromSlug(urlHit[1]!);
      }
      if (!title) title = productKey;
      if (!seen.has(productKey)) {
        const url = normalizeProductUrl(urlPath, productKey, baseUrl);
        if (!url) {
          for (const v of Object.values(obj)) visit(v, depth + 1);
          return;
        }
        seen.add(productKey);
        const priceObj = asRecord(obj.price) ?? asRecord(obj.sale_price);
        const price =
          pickNumber(obj.sale_price) ??
          pickNumber(obj.price) ??
          pickNumber(priceObj?.amount) ??
          pickNumber(obj.sellingPrice) ??
          null;
        const sig = pickListSignals(obj);
        const brand =
          (typeof obj.brand === "string" && obj.brand.trim()) ||
          (typeof obj.brandName === "string" && obj.brandName.trim()) ||
          null;
        found.push({
          productKey,
          title,
          url,
          price,
          brand,
          ...sig,
        });
      }
    }
    for (const v of Object.values(obj)) visit(v, depth + 1);
  };

  visit(payload, 0);
  return found;
}
