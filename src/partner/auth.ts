/**
 * Partner API auth: Service Account JSON → RS256 JWT → gateway Cookie.
 * Aligns with Noon official Quick Start (no third-party SDK required).
 */
import { createSign, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { NOON_API_GATEWAY } from "./endpoints.js";

export type NoonCredentials = {
  key_id: string;
  private_key: string;
  project_code: string;
};

export class NoonHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "NoonHttpError";
  }
}

type GatewaySession = {
  cookieHeader: string;
  obtainedAt: number;
};

/** Bucket by credentials path so concurrent projects do not share cookies. */
const gatewayByKey = new Map<string, GatewaySession>();

function userAgent() {
  return process.env.NOON_USER_AGENT?.trim() || "noon-ops-framework/0.2";
}

export function credentialsPath(): string {
  const p = process.env.NOON_CREDENTIALS_FILE?.trim();
  if (!p) {
    throw new Error(
      "Set NOON_CREDENTIALS_FILE to your Service Account JSON path (never commit that file).",
    );
  }
  return p;
}

export function readCredentials(
  filePath = credentialsPath(),
): NoonCredentials {
  if (!existsSync(filePath)) {
    throw new Error(`Credentials file not found: ${filePath}`);
  }
  const raw = JSON.parse(readFileSync(filePath, "utf8")) as NoonCredentials;
  if (!raw.key_id || !raw.private_key || !raw.project_code) {
    throw new Error(
      "Credentials JSON must include key_id, private_key, project_code",
    );
  }
  return {
    key_id: String(raw.key_id).trim(),
    private_key: String(raw.private_key).trim(),
    project_code: String(raw.project_code).trim(),
  };
}

function base64url(buf: Buffer | string) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Official Quick Start: RS256 JWT with sub = key_id */
export function createApiJwt(credentials: NoonCredentials): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      sub: credentials.key_id,
      iat: Math.floor(Date.now() / 1000),
      jti: randomUUID(),
    }),
  );
  const signingInput = `${header}.${payload}`;
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  return `${signingInput}.${base64url(sign.sign(credentials.private_key))}`;
}

function extractCookieHeader(res: Response): string {
  const anyHeaders = res.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const list =
    typeof anyHeaders.getSetCookie === "function"
      ? anyHeaders.getSetCookie()
      : [];
  if (list.length) {
    return list.map((c) => c.split(";")[0]!.trim()).join("; ");
  }
  const single = res.headers.get("set-cookie");
  if (!single) return "";
  return single
    .split(/,(?=[^;]+?=)/)
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
}

function cacheKey(): string {
  return `cred:${credentialsPath()}`;
}

/** Login and cache cookie ~50 minutes */
export async function loginGateway(force = false): Promise<GatewaySession> {
  const key = cacheKey();
  const cached = gatewayByKey.get(key);
  if (!force && cached && Date.now() - cached.obtainedAt < 50 * 60 * 1000) {
    return cached;
  }
  const credentials = readCredentials();
  const token = createApiJwt(credentials);
  const res = await fetch(`${NOON_API_GATEWAY}/identity/public/v1/api/login`, {
    method: "POST",
    headers: {
      "User-Agent": userAgent(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      token,
      default_project_code: credentials.project_code,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new NoonHttpError(
      `login HTTP ${res.status}`,
      res.status,
      text.slice(0, 400),
    );
  }
  const cookieHeader = extractCookieHeader(res);
  if (!cookieHeader) {
    throw new Error(
      "Login OK but no Set-Cookie. Use a runtime that exposes getSetCookie().",
    );
  }
  const session: GatewaySession = { cookieHeader, obtainedAt: Date.now() };
  gatewayByKey.set(key, session);
  return session;
}

export function clearGatewayCache() {
  gatewayByKey.clear();
}

export async function gatewayFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const session = await loginGateway();
  const credentials = readCredentials();
  const url = new URL(path.replace(/^\//, ""), `${NOON_API_GATEWAY}/`);
  const headers = new Headers(init.headers);
  headers.set("User-Agent", userAgent());
  headers.set("Cookie", session.cookieHeader);
  headers.set("X-Project", credentials.project_code);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401 || res.status === 403) {
    clearGatewayCache();
    const retrySession = await loginGateway(true);
    headers.set("Cookie", retrySession.cookieHeader);
    return fetch(url, { ...init, headers });
  }
  return res;
}

/** JSON helper over gatewayFetch */
export async function noonJson(
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const cleanPath = path.replace(/^(GET|POST|PUT|PATCH|DELETE)\s+/i, "");
  const res = await gatewayFetch(cleanPath, {
    method: method || "GET",
    headers:
      body === undefined
        ? undefined
        : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new NoonHttpError(
      `NOON HTTP ${res.status} ${cleanPath}`,
      res.status,
      text.slice(0, 800),
    );
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
