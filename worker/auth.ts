import type { Env } from "./env";

/**
 * Simple shared-password sign-in.
 *
 * Everyone uses the same password (the APP_PASSWORD secret) and picks their name.
 * The server then sets a long-lived cookie holding the member id, signed with an
 * HMAC keyed on the password, so changing the password signs everyone out.
 */

export const SESSION_COOKIE = "wl_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // one year

const encoder = new TextEncoder();

async function sign(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(`watch-list:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compares two strings without leaking where they differ through timing. */
export function safeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export function isConfigured(env: Env): boolean {
  return !!env.APP_PASSWORD;
}

export function passwordMatches(given: string, env: Env): boolean {
  return isConfigured(env) && safeEqual(given, env.APP_PASSWORD!);
}

export async function sessionToken(memberId: number, env: Env): Promise<string> {
  return `${memberId}.${await sign(env.APP_PASSWORD!, String(memberId))}`;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** The signed-in member id, or null. */
export async function memberIdFromRequest(req: Request, env: Env): Promise<number | null> {
  if (!isConfigured(env)) return null;
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const [idPart, sig] = token.split(".");
  const id = Number(idPart);
  if (!Number.isInteger(id) || id <= 0 || !sig) return null;
  return safeEqual(sig, await sign(env.APP_PASSWORD!, String(id))) ? id : null;
}

export function sessionCookieHeader(token: string, req: Request): string {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
