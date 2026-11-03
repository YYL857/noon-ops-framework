/**
 * Assess Playwright storage_state.json cookie health for Noon domains.
 *
 * Env:
 *   NOON_PW_STORAGE_STATE  — path to storage_state.json (preferred)
 *   or NOON_BROWSER_PROFILE — profile dir containing storage_state.json
 *   NOON_PW_SESSION_WARN_MS — warn window (default 48h)
 *
 * Usage: node tools/pw-session/session_status.mjs
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

function warnWithinMs() {
  const n = Number(process.env.NOON_PW_SESSION_WARN_MS);
  return Number.isFinite(n) && n > 0 ? n : 48 * 60 * 60 * 1000;
}

function isNoonDomain(domain) {
  if (!domain) return false;
  const d = String(domain).toLowerCase().replace(/^\./, "");
  return d.includes("noon.partners") || d.includes("noon.com");
}

export function assessCookies(cookies, nowMs, warnMs) {
  const noon = (cookies || []).filter((c) => isNoonDomain(c.domain));
  const cookieCount = noon.length;
  if (!cookieCount) {
    return {
      cookieCount: 0,
      persistentCookieCount: 0,
      earliestExpiresAt: null,
      level: "missing",
      message: "No Noon cookies — log in and save storage_state.",
    };
  }

  const persistent = noon.filter(
    (c) => typeof c.expires === "number" && c.expires > 0,
  );
  const persistentCookieCount = persistent.length;
  if (!persistentCookieCount) {
    return {
      cookieCount,
      persistentCookieCount: 0,
      earliestExpiresAt: null,
      level: "unknown",
      message:
        "Only session cookies; absolute expiry unknown. Re-login if exports fail.",
    };
  }

  let minExp = Infinity;
  for (const c of persistent) {
    const expMs = c.expires * 1000;
    if (expMs < minExp) minExp = expMs;
  }
  const earliestExpiresAt = new Date(minExp).toISOString();
  if (minExp <= nowMs) {
    return {
      cookieCount,
      persistentCookieCount,
      earliestExpiresAt,
      level: "expired",
      message: "Login cookies expired — re-login required.",
    };
  }
  if (minExp - nowMs <= warnMs) {
    const hours = Math.max(1, Math.round((minExp - nowMs) / 3600000));
    return {
      cookieCount,
      persistentCookieCount,
      earliestExpiresAt,
      level: "expiring",
      message: `Expires within ~${hours}h — re-login soon.`,
    };
  }
  return {
    cookieCount,
    persistentCookieCount,
    earliestExpiresAt,
    level: "ok",
    message: "Session looks valid.",
  };
}

function resolveStatePath() {
  const direct = process.env.NOON_PW_STORAGE_STATE?.trim();
  if (direct) return resolve(direct);
  const profile = process.env.NOON_BROWSER_PROFILE?.trim();
  if (profile) return join(resolve(profile), "storage_state.json");
  return null;
}

function main() {
  const statePath = resolveStatePath();
  if (!statePath) {
    console.error(
      "Set NOON_PW_STORAGE_STATE or NOON_BROWSER_PROFILE (profile dir with storage_state.json).",
    );
    process.exit(2);
  }

  const nowMs = Date.now();
  const warnMs = warnWithinMs();
  if (!existsSync(statePath)) {
    console.log(
      JSON.stringify(
        {
          checkedAt: new Date(nowMs).toISOString(),
          statePath,
          stateExists: false,
          level: "missing",
          message: "storage_state.json not found — log in first.",
          needsAttention: true,
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  let stateMtime = null;
  try {
    stateMtime = statSync(statePath).mtime.toISOString();
  } catch {
    /* ignore */
  }

  let assessed;
  try {
    const raw = JSON.parse(readFileSync(statePath, "utf8"));
    assessed = assessCookies(raw.cookies ?? [], nowMs, warnMs);
  } catch {
    assessed = {
      cookieCount: 0,
      persistentCookieCount: 0,
      earliestExpiresAt: null,
      level: "missing",
      message: "Could not parse storage_state — re-login.",
    };
  }

  const needsAttention = ["missing", "expired", "expiring"].includes(
    assessed.level,
  );
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date(nowMs).toISOString(),
        warnWithinMs: warnMs,
        statePath,
        stateExists: true,
        stateMtime,
        ...assessed,
        needsAttention,
      },
      null,
      2,
    ),
  );
  process.exit(needsAttention ? 1 : 0);
}

if (process.argv[1]?.includes("session_status")) {
  main();
}
