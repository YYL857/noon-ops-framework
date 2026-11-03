/**
 * Shared helpers for Noon Seller Lab discovery (Playwright + persistent profile).
 * Profile path: NOON_BROWSER_PROFILE (required) — never hardcode machine paths.
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const OUT_DIR = join(__dirname, "out");
export const PAGES_DIR = join(OUT_DIR, "pages");
export const SHOTS_DIR = join(OUT_DIR, "screenshots");

export function profileDir() {
  const p = process.env.NOON_BROWSER_PROFILE?.trim();
  if (!p) {
    throw new Error(
      "Set NOON_BROWSER_PROFILE to a Playwright persistent profile directory " +
        "(login once with headed Chromium, then re-run discovery).",
    );
  }
  return resolve(p);
}

export function ensureOutDirs() {
  for (const d of [OUT_DIR, PAGES_DIR, SHOTS_DIR]) {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  }
}

export function writeJson(name, data) {
  ensureOutDirs();
  const p = join(OUT_DIR, name);
  writeFileSync(p, JSON.stringify(data, null, 2), "utf8");
  return p;
}

export function readJson(name, fallback = null) {
  const p = join(OUT_DIR, name);
  if (!existsSync(p)) return fallback;
  return JSON.parse(readFileSync(p, "utf8"));
}

export function chromiumLaunchOptions(headless = false) {
  return {
    headless,
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
  };
}

export async function loadPlaywright() {
  let mod;
  try {
    mod = await import("playwright");
  } catch {
    throw new Error(
      "playwright not found. From repo root: npm i -D playwright && npx playwright install chromium",
    );
  }
  const pw = mod.default ?? mod;
  if (!pw?.chromium) {
    throw new Error("playwright loaded but chromium missing");
  }
  return pw;
}

export function headlessFlag() {
  return process.env.NOON_DISCOVER_HEADLESS === "1";
}

export function startUrl() {
  return (
    process.env.NOON_DISCOVER_START?.trim() ||
    "https://www.noon.partners/en-ae/"
  );
}

export function maxPages() {
  const n = Number(process.env.NOON_DISCOVER_MAX_PAGES ?? 30);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

export function guessDomainFromHref(href) {
  const h = String(href || "").toLowerCase();
  if (/ads|campaign|admanager/.test(h)) return "ads";
  if (/order|oms/.test(h)) return "orders";
  if (/catalog|content|offer/.test(h)) return "catalog";
  if (/inventory|fbn|stock|warehouse/.test(h)) return "stock";
  if (/finance|transaction|settlement|invoice/.test(h)) return "fees";
  if (/report|sales|views/.test(h)) return "sales";
  return null;
}
