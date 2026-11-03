/**
 * My Catalog display price via Offer API.
 * Pricing API `price` is seller floor (Manual); on sale the page shows Offer amount.
 * GET /offer/v1/product/{partner_sku} — does not consume Impex quota.
 */
import { NoonHttpError, noonJson } from "./auth.js";

const CONCURRENCY = 8;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Return new price when live differs from current; otherwise null. */
export function nextLivePrice(
  current: number,
  live: number | null | undefined,
): number | null {
  if (live == null || !Number.isFinite(live) || live <= 0) return null;
  const price = roundMoney(live);
  if (Math.abs(price - current) < 0.005) return null;
  return price;
}

type OfferRow = {
  country_code?: string;
  business_model?: string;
  live_status?: boolean;
  price?: { amount?: number | string | null; currency?: string } | null;
};

/** Display price for the shop country; null if missing. */
export function pickOfferAmount(raw: unknown, countryCode: string): number | null {
  if (!raw || typeof raw !== "object") return null;
  const offers = (raw as { offers?: unknown }).offers;
  if (!Array.isArray(offers)) return null;
  const country = countryCode.toLowerCase();
  const rows = offers.filter((o): o is OfferRow => {
    if (!o || typeof o !== "object") return false;
    return String((o as OfferRow).country_code ?? "").toLowerCase() === country;
  });
  const chosen =
    rows.find((o) => o.live_status && (o.business_model ?? "noon") === "noon") ??
    rows.find((o) => (o.business_model ?? "noon") === "noon") ??
    rows[0];
  if (!chosen?.price || typeof chosen.price !== "object") return null;
  const amount = Number(chosen.price.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return roundMoney(amount);
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      for (;;) {
        const idx = cursor;
        cursor += 1;
        if (idx >= items.length) return;
        await fn(items[idx]!);
      }
    },
  );
  await Promise.all(workers);
}

/** partner_sku → My Catalog live price. Skip per-SKU failures; throw if all fail. */
export async function batchGetLivePrices(
  partnerSkus: string[],
  countryCode = "sa",
): Promise<Map<string, number>> {
  const country = countryCode.toLowerCase();
  const unique = [...new Set(partnerSkus.map((s) => s.trim()).filter(Boolean))];
  const out = new Map<string, number>();
  let ok = 0;
  let lastErr: unknown;

  await mapPool(unique, CONCURRENCY, async (sku) => {
    try {
      const raw = await noonJson(
        "GET",
        `/offer/v1/product/${encodeURIComponent(sku)}`,
      );
      ok += 1;
      const price = pickOfferAmount(raw, country);
      if (price != null) out.set(sku, price);
    } catch (err) {
      if (err instanceof NoonHttpError && err.status === 404) {
        ok += 1;
        return;
      }
      lastErr = err;
    }
  });

  if (ok === 0 && lastErr) {
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
  return out;
}
