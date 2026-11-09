export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** TMDB "API Read Access Token" (a secret: `wrangler secret put TMDB_TOKEN`). */
  TMDB_TOKEN: string;
  /** Override for tests; defaults to https://api.themoviedb.org/3 */
  TMDB_API_BASE?: string;
  /** Two-letter country code for streaming availability. */
  REGION: string;
  /** Shared sign-in password (a secret: `wrangler secret put APP_PASSWORD`). */
  APP_PASSWORD?: string;
}
