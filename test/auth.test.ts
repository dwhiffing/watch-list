import { describe, expect, it } from "vitest";
import { resolveEmail } from "../worker/auth";
import type { Env } from "../worker/env";

const env = (over: Partial<Env>): Env => ({ REGION: "CA", TMDB_TOKEN: "x", ...over }) as Env;
const req = (headers: Record<string, string> = {}) => new Request("https://example.com/api/me", { headers });

describe("resolveEmail", () => {
  it("rejects requests without an Access token in production", async () => {
    expect(await resolveEmail(req(), env({ ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" }))).toBeNull();
  });

  it("ignores the dev header outside dev mode", async () => {
    expect(await resolveEmail(req({ "x-dev-email": "dan@example.com" }), env({}))).toBeNull();
  });

  it("rejects a forged Access header that isn't a valid JWT", async () => {
    const e = env({ ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com", ACCESS_AUD: "aud" });
    expect(await resolveEmail(req({ "cf-access-jwt-assertion": "not-a-jwt", "cf-access-authenticated-user-email": "x@y.z" }), e)).toBeNull();
  });

  it("in dev mode, only allows listed emails", async () => {
    const e = env({ DEV_MODE: "true", DEV_EMAILS: "a@x.com, b@x.com" });
    expect(await resolveEmail(req({ "x-dev-email": "b@x.com" }), e)).toBe("b@x.com");
    expect(await resolveEmail(req({ "x-dev-email": "evil@x.com" }), e)).toBe("a@x.com");
    expect(await resolveEmail(req(), e)).toBe("a@x.com");
  });
});
