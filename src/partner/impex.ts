/**
 * Partner Impex: async CSV export (bypasses Seller Lab / Akamai).
 * Flow: create → poll status → download_url → CSV text.
 * Noon limit ≈ 20 exports / 30 min; on hit, process-local cooldown
 * (NOON_IMPEX_COOLDOWN_MS, default 30 min) keyed by credentials path.
 */
import { NoonHttpError, credentialsPath, noonJson, readCredentials } from "./auth.js";

export const IMPEX_EXPORT_CATEGORIES = {
  catalog: "noon_catalog_catalogexport",
  catalogGlobal: "noon_catalog_globalcatalogexport",
  orders: "noon_noonoms_ordersexport",
  stockFbnDetailed: "fbn_inventoryv2_ledgerdetailedview",
  stockFbnSummary: "fbn_inventoryv2_ledgersummaryview",
  stockAging: "fbn_inventoryv2_aging",
  sales: "noon_catalog_reports_productviewsandsalesdata",
  fees: "noon_financeweb_transactionviewreportonitemlevel",
  invoices: "noon_financeweb_invoicesandcreditnotes",
} as const;

export type ImpexExportCategoryCode =
  (typeof IMPEX_EXPORT_CATEGORIES)[keyof typeof IMPEX_EXPORT_CATEGORIES];

type ImpexCreateResult = { export_code?: string };
type ImpexStatusResult = {
  export_code?: string;
  export_status?: string;
  download_url?: string | null;
  export_category_code?: string;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialize: one Impex export at a time in this process */
let impexChain: Promise<unknown> = Promise.resolve();

function withImpexLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = impexChain.then(fn, fn);
  impexChain = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

const impexCooldownUntilByKey = new Map<string, number>();

export function impexCooldownKey(): string {
  return `cred:${credentialsPath()}`;
}

function impexCooldownMs(): number {
  return Math.max(
    60_000,
    Number(process.env.NOON_IMPEX_COOLDOWN_MS ?? 30 * 60 * 1000),
  );
}

export function getImpexCooldownRemainingMs(): number {
  const until = impexCooldownUntilByKey.get(impexCooldownKey()) ?? 0;
  return Math.max(0, until - Date.now());
}

export function isImpexCoolingDown(): boolean {
  return getImpexCooldownRemainingMs() > 0;
}

export function markImpexExportLimitHit(cooldownMs = impexCooldownMs()): void {
  const key = impexCooldownKey();
  const until = Date.now() + cooldownMs;
  const prev = impexCooldownUntilByKey.get(key) ?? 0;
  impexCooldownUntilByKey.set(key, Math.max(prev, until));
}

export function assertImpexAvailable(): void {
  const rem = getImpexCooldownRemainingMs();
  if (rem <= 0) return;
  throw new Error(
    `Impex cooling down (~${Math.ceil(rem / 60_000)} min left; Noon ≈ 20 exports / 30 min).`,
  );
}

export function resetImpexCooldownsForTests(): void {
  impexCooldownUntilByKey.clear();
}

export function isImpexLimitMessage(msg: string): boolean {
  return /export limit|冷却中|exports in the last/i.test(msg);
}

export function impexDateYmd(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function impexDateRangeDays(days: number): {
  from_date: string;
  to_date: string;
} {
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return { from_date: impexDateYmd(from), to_date: impexDateYmd(to) };
}

export async function listExportCategories(): Promise<unknown> {
  return noonJson("GET", "/impex/v1/export/category/list");
}

export async function createImpexExport(
  exportCategoryCode: string,
  params?: Record<string, string | number | boolean | null | undefined>,
): Promise<string> {
  const body: Record<string, unknown> = {
    export_category_code: exportCategoryCode,
  };
  if (params && Object.keys(params).length) {
    const cleaned: Record<string, string | number | boolean> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === "") continue;
      cleaned[k] = v;
    }
    if (Object.keys(cleaned).length) body.params = cleaned;
  }
  const raw = (await noonJson(
    "POST",
    "/impex/v1/export/create",
    body,
  )) as ImpexCreateResult;
  const code = raw?.export_code?.trim();
  if (!code) {
    throw new Error(
      `Impex create returned no export_code (${exportCategoryCode}): ${JSON.stringify(raw).slice(0, 200)}`,
    );
  }
  return code;
}

export async function getImpexExportStatus(
  exportCode: string,
): Promise<ImpexStatusResult> {
  return (await noonJson("POST", "/impex/v1/export/status", {
    export_code: exportCode,
  })) as ImpexStatusResult;
}

export async function waitImpexExport(
  exportCode: string,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<ImpexStatusResult> {
  const timeoutMs = opts?.timeoutMs ?? 10 * 60 * 1000;
  const pollMs = opts?.pollMs ?? 2500;
  const started = Date.now();
  for (;;) {
    const st = await getImpexExportStatus(exportCode);
    const status = (st.export_status ?? "").toUpperCase();
    if (
      status &&
      status !== "RUNNING" &&
      status !== "QUEUED" &&
      status !== "PENDING"
    ) {
      if (
        status !== "COMPLETE" &&
        status !== "COMPLETED" &&
        status !== "SUCCESS"
      ) {
        throw new Error(
          `Impex export failed ${exportCode}: status=${st.export_status} ${JSON.stringify(st).slice(0, 300)}`,
        );
      }
      if (!st.download_url) {
        throw new Error(`Impex complete but no download_url: ${exportCode}`);
      }
      return st;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Impex timeout ${exportCode} (>${Math.round(timeoutMs / 1000)}s) status=${st.export_status ?? "?"}`,
      );
    }
    await sleep(pollMs);
  }
}

export async function downloadImpexCsv(downloadUrl: string): Promise<string> {
  const res = await fetch(downloadUrl, {
    headers: { Accept: "text/csv,*/*" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new NoonHttpError(
      `Impex download HTTP ${res.status}`,
      res.status,
      text.slice(0, 400),
    );
  }
  return text;
}

/**
 * Create, wait, and download CSV for a category.
 * Retries create briefly if another export is already running.
 */
export async function runImpexExportCsv(
  exportCategoryCode: string,
  params?: Record<string, string | number | boolean | null | undefined>,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<{ exportCode: string; csv: string; category: string }> {
  readCredentials(); // fail fast if unset

  return withImpexLock(async () => {
    assertImpexAvailable();
    let exportCode = "";
    let lastErr: unknown;
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        exportCode = await createImpexExport(exportCategoryCode, params);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        const msg =
          err instanceof NoonHttpError
            ? `${err.message} ${err.body}`
            : err instanceof Error
              ? err.message
              : String(err);
        if (/already running|already in progress|concurrent/i.test(msg)) {
          await sleep(5000);
          continue;
        }
        if (/export limit reached|exports in the last/i.test(msg)) {
          markImpexExportLimitHit();
          throw new Error(
            `Impex export limit hit (Noon ≈ 20 / 30 min). Retry later. Detail: ${msg.slice(0, 200)}`,
          );
        }
        throw err;
      }
    }
    if (!exportCode) {
      throw lastErr instanceof Error
        ? lastErr
        : new Error(`Impex create failed: ${String(lastErr)}`);
    }

    const st = await waitImpexExport(exportCode, opts);
    const csv = await downloadImpexCsv(st.download_url!);
    return {
      exportCode,
      csv,
      category: st.export_category_code ?? exportCategoryCode,
    };
  });
}

/** Suggested domain → category codes (always verify via listExportCategories). */
export const SUGGESTED_IMPEX_CATEGORIES = IMPEX_EXPORT_CATEGORIES;
