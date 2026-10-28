/**
 * Path B contract: drop portal CSVs into a folder, ingest idempotently.
 * Implement parsers per domain in your app; this file only defines the shape.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import { createInterface } from "node:readline";

export type SyncDomain =
  | "catalog"
  | "stock"
  | "orders"
  | "sales"
  | "fees"
  | "fee_estimates"
  | "ads";

export type IngestReceipt = {
  domain: SyncDomain;
  fileName: string;
  contentSha256: string;
  importedAt: string;
  rowHint?: number;
};

export type IngestIndex = {
  /** contentSha256 → receipt */
  byHash: Record<string, IngestReceipt>;
};

export function defaultImportsDir(): string {
  return (
    process.env.NOON_PORTAL_IMPORTS_DIR?.trim() ||
    join(process.cwd(), "data", "portal-imports")
  );
}

export function ensureImportsDir(dir = defaultImportsDir()) {
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, "_done"), { recursive: true });
  mkdirSync(join(dir, "_failed"), { recursive: true });
  return dir;
}

/** Guess domain from filename conventions you choose for RPA exports */
export function guessDomain(fileName: string): SyncDomain | null {
  const n = fileName.toLowerCase();
  if (n.includes("ads") || n.includes("campaign")) return "ads";
  if (n.includes("transaction") || n.includes("fee")) return "fees";
  if (n.includes("sales") || n.includes("viewsandsales")) return "sales";
  if (n.includes("order")) return "orders";
  if (n.includes("stock") || n.includes("inventory") || n.includes("fbn"))
    return "stock";
  if (n.includes("catalog") || n.includes("live")) return "catalog";
  return null;
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

/** Count non-empty lines minus a header — rough progress only */
export async function countDataRows(filePath: string): Promise<number> {
  let n = 0;
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) n += 1;
  }
  return Math.max(0, n - 1);
}

/**
 * Scan inbox once. Caller supplies `handle` to parse+upsert.
 * Already-seen content hashes are skipped; successes move to `_done/`.
 */
export async function scanPortalImports(opts: {
  dir?: string;
  index: IngestIndex;
  handle: (args: {
    domain: SyncDomain;
    filePath: string;
    fileName: string;
  }) => Promise<void>;
}): Promise<IngestReceipt[]> {
  const dir = ensureImportsDir(opts.dir);
  const out: IngestReceipt[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith("_") || name.startsWith(".")) continue;
    if (!name.toLowerCase().endsWith(".csv")) continue;
    const domain = guessDomain(name);
    if (!domain) continue;
    const filePath = join(dir, name);
    if (!existsSync(filePath)) continue;
    const contentSha256 = await sha256File(filePath);
    if (opts.index.byHash[contentSha256]) continue;
    try {
      await opts.handle({ domain, filePath, fileName: name });
      const receipt: IngestReceipt = {
        domain,
        fileName: name,
        contentSha256,
        importedAt: new Date().toISOString(),
        rowHint: await countDataRows(filePath),
      };
      opts.index.byHash[contentSha256] = receipt;
      renameSync(filePath, join(dir, "_done", `${Date.now()}_${basename(name)}`));
      out.push(receipt);
    } catch (err) {
      renameSync(filePath, join(dir, "_failed", `${Date.now()}_${basename(name)}`));
      throw err;
    }
  }
  return out;
}
