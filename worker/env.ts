export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** TMDB "API Read Access Token" (a secret: `wrangler secret put TMDB_TOKEN`). */
  TMDB_TOKEN: string;
  /** Override for tests; defaults to https://api.themoviedb.org/3 */
  TMDB_API_BASE?: string;
  /** Two-letter country code for streaming availability. */
  REGION: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  /** Optional extra allow-list on top of the Access policy, comma-separated. */
  ALLOWED_EMAILS?: string;
  /** Local development only. */
  DEV_MODE?: string;
  DEV_EMAILS?: string;
}
