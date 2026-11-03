/**
 * Market-view summary math + lightweight shape checks.
 * No disk I/O / shop paths — callers persist however they want.
 */

export type MarketViewCompetitor = {
  productKey: string;
  title?: string;
  url?: string;
  price?: number | null;
  listPrice?: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  isExpress?: boolean;
  soldRecently?: string | number | null;
};

export type MarketViewSummary = {
  count: number;
  min: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  max: number | null;
  cheaperCount: number | null;
  myPositionFromCheapest: number | null;
  medianGapPct: number | null;
};

export type MarketViewSnapshot = {
  anchorKey: string;
  capturedAt: string;
  own: {
    price?: number | null;
    rank?: number | null;
    [key: string]: unknown;
  };
  competitors: MarketViewCompetitor[];
  summary: MarketViewSummary;
  changes?: Array<{
    productKey: string;
    type:
      | "price_drop"
      | "price_up"
      | "out_of_stock"
      | "back_in_stock"
      | "new_entrant";
    from?: number;
    to?: number;
    pct?: number;
  }>;
};

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const w = idx - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

/** Recompute summary from competitors (+ optional own price). Must match disk → UI. */
export function computeMarketViewSummary(
  competitors: MarketViewCompetitor[],
  ownPrice?: number | null,
): MarketViewSummary {
  const prices = competitors
    .map((c) => c.price)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b);
  const count = competitors.length;
  const min = prices[0] ?? null;
  const max = prices.length ? prices[prices.length - 1]! : null;
  const median = percentile(prices, 0.5);
  const p25 = percentile(prices, 0.25);
  const p75 = percentile(prices, 0.75);

  let cheaperCount: number | null = null;
  let myPositionFromCheapest: number | null = null;
  let medianGapPct: number | null = null;

  if (ownPrice != null && Number.isFinite(ownPrice) && ownPrice > 0 && prices.length) {
    cheaperCount = prices.filter((p) => p < ownPrice - 0.005).length;
    myPositionFromCheapest = cheaperCount + 1;
    if (median != null && median > 0) {
      medianGapPct = Math.round(((ownPrice - median) / median) * 1000) / 10;
    }
  }

  return {
    count,
    min,
    p25,
    median,
    p75,
    max,
    cheaperCount,
    myPositionFromCheapest,
    medianGapPct,
  };
}

export function safeAnchorFileKey(anchorKey: string): string {
  const k = String(anchorKey || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (!k) throw new Error("invalid anchorKey");
  return k.slice(0, 80);
}

/** Validate required fields without pulling in a zod dependency. */
export function assertMarketViewShape(raw: unknown): MarketViewSnapshot {
  if (!raw || typeof raw !== "object") throw new Error("market view must be an object");
  const o = raw as Record<string, unknown>;
  if (typeof o.anchorKey !== "string" || !o.anchorKey.trim())
    throw new Error("anchorKey required");
  if (typeof o.capturedAt !== "string" || !o.capturedAt.trim())
    throw new Error("capturedAt required");
  if (!o.own || typeof o.own !== "object") throw new Error("own required");
  if (!Array.isArray(o.competitors)) throw new Error("competitors must be an array");
  if (!o.summary || typeof o.summary !== "object")
    throw new Error("summary required");
  return o as MarketViewSnapshot;
}
