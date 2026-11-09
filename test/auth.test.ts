import { describe, expect, it } from "vitest";
import { memberIdFromRequest, passwordMatches, safeEqual, sessionCookieHeader, sessionToken } from "../worker/auth";
import type { Env } from "../worker/env";

const env = (over: Partial<Env> = {}): Env => ({ REGION: "CA", TMDB_TOKEN: "x", APP_PASSWORD: "popcorn", ...over }) as Env;
const withCookie = (cookie?: string) => new Request("https://example.com/api/me", { headers: cookie ? { cookie } : {} });

describe("password sign-in", () => {
  it("checks the shared password", () => {
    expect(passwordMatches("popcorn", env())).toBe(true);
    expect(passwordMatches("Popcorn", env())).toBe(false);
    expect(passwordMatches("", env())).toBe(false);
    expect(passwordMatches("", env({ APP_PASSWORD: "" }))).toBe(false);
  });

  it("accepts a cookie it signed", async () => {
    const token = await sessionToken(2, env());
    expect(await memberIdFromRequest(withCookie(`other=1; wl_session=${token}`), env())).toBe(2);
  });

  it("rejects missing, edited or forged cookies", async () => {
    const token = await sessionToken(2, env());
    const sig = token.split(".")[1];
    expect(await memberIdFromRequest(withCookie(), env())).toBeNull();
    expect(await memberIdFromRequest(withCookie(`wl_session=1.${sig}`), env())).toBeNull();
    expect(await memberIdFromRequest(withCookie("wl_session=2.abc"), env())).toBeNull();
    expect(await memberIdFromRequest(withCookie("wl_session=2"), env())).toBeNull();
  });

  it("signs everyone out when the password changes", async () => {
    const token = await sessionToken(2, env());
    expect(await memberIdFromRequest(withCookie(`wl_session=${token}`), env({ APP_PASSWORD: "new" }))).toBeNull();
  });

  it("sets a long-lived, HttpOnly, Secure cookie on https", () => {
    const header = sessionCookieHeader("1.x", withCookie());
    expect(header).toContain("HttpOnly");
    expect(header).toContain("Secure");
    expect(header).toContain("Max-Age=31536000");
  });

  it("compares strings exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});
