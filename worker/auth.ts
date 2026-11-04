import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./env";

const jwksByTeam = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function devEmails(env: Env): string[] {
  return (env.DEV_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isDevMode(env: Env): boolean {
  return env.DEV_MODE === "true";
}

export function listDevEmails(env: Env): string[] | undefined {
  return isDevMode(env) ? devEmails(env) : undefined;
}

/**
 * Works out who is making the request.
 *
 * In production the app sits behind Cloudflare Access, which signs every request with a JWT.
 * We verify that JWT ourselves so requests that bypass Access (e.g. the workers.dev URL) are rejected.
 * In local dev (DEV_MODE=true) the email comes from the x-dev-email header instead.
 */
export async function resolveEmail(req: Request, env: Env): Promise<string | null> {
  if (isDevMode(env)) {
    const allowed = devEmails(env);
    const requested = req.headers.get("x-dev-email")?.toLowerCase();
    if (requested && allowed.includes(requested)) return requested;
    return allowed[0] ?? "dev@example.com";
  }

  const token = req.headers.get("cf-access-jwt-assertion");
  const team = env.ACCESS_TEAM_DOMAIN?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (!token || !team || !env.ACCESS_AUD) return null;

  let jwks = jwksByTeam.get(team);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`https://${team}/cdn-cgi/access/certs`));
    jwksByTeam.set(team, jwks);
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer: `https://${team}`, audience: env.ACCESS_AUD });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    if (!email) return null;
    const allowList = (env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (allowList.length > 0 && !allowList.includes(email)) return null;
    return email;
  } catch {
    return null;
  }
}
