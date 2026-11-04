# watch-list

A private PWA for two people to track what we watch and pick what to watch next.

**Phase 1 (this version):** swipe through movies and shows, log what you've watched, thumbs up/down, TV episode progress, and a shared watchlist where titles you both want sit at the top. Streaming services (Netflix, Prime Video and Disney+ to start) can be switched on and off in Settings, and availability is for Canada.

Runs entirely on Cloudflare's free tier: one Worker serves the React app and the `/api` routes, with a D1 (SQLite) database. Title data comes from [TMDB](https://www.themoviedb.org/), streaming availability from TMDB's JustWatch data.

## How it works

| Screen | What it does |
| --- | --- |
| Discover | Card deck. Swipe right = Want, left = Pass, up = Seen it (then thumbs up/down). Titles your partner wants show up first, with a badge, and a shared Want shows a match. Filters: movies/shows, genre, only on our services. Undo button for mis-swipes. |
| Watchlist | Everything either of you wants. Both-want titles first, then by rating. "Continue watching" for shows in progress. Filter by type or by your services. |
| Search | Find any movie or show and add it with one tap. |
| Title page | Details, cast, where it streams, your thumbs and your partner's, mark watched (who, when, rewatch), log TV episodes or mark a show finished. |
| Watched | Everything you've finished, newest first, with both of your ratings. |
| Settings | Your display name, streaming services on/off. |

Code layout:

- `src/` – React app (Vite, Tailwind, `vite-plugin-pwa`)
- `worker/` – Cloudflare Worker API (Hono), TMDB client, Access JWT check
- `shared/` – types and pure ranking helpers used by both
- `migrations/` – D1 schema
- `scripts/mock-tmdb.mjs` – fake TMDB for local dev without an API key

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars      # add your TMDB token, or use the mock below
npm run db:migrate:local
npm run dev                          # http://localhost:5173
```

No TMDB key yet? Run the mock and point the app at it:

```sh
node scripts/mock-tmdb.mjs 4010
# in .dev.vars:
# TMDB_TOKEN=mock
# TMDB_API_BASE=http://localhost:4010/3
```

With `DEV_MODE=true`, sign-in is skipped and Settings has an "act as" switch between the emails in `DEV_EMAILS`, so you can test matching as both people.

```sh
npm test         # unit tests
npm run build    # typecheck + production build
```

## Deploying to Cloudflare

1. Get a free TMDB account and copy the **API Read Access Token** from https://www.themoviedb.org/settings/api.
2. Log in and create the database:
   ```sh
   npx wrangler login
   npx wrangler d1 create watch-list
   ```
   Put the printed `database_id` into `wrangler.jsonc`.
3. Add the TMDB token as a secret: `npx wrangler secret put TMDB_TOKEN`
4. Deploy: `npm run deploy` (builds, applies migrations, deploys). Note the URL it prints.
5. Lock it down with **Cloudflare Access** (free for small teams):
   - In the Cloudflare dashboard, go to Zero Trust → Access → Applications → Add an application → Self-hosted.
   - Use the app's hostname (your `*.workers.dev` URL or a custom domain).
   - Add a policy that allows only your two email addresses, with the one-time PIN login method.
   - Copy the application's **AUD tag** and your **team domain** (`<team>.cloudflareaccess.com`) into `ACCESS_AUD` and `ACCESS_TEAM_DOMAIN` in `wrangler.jsonc`, then `npm run deploy` again.

   The Worker checks the Access token on every API call, so requests that skip Access are refused.
6. On each phone, open the URL and add it to the home screen (Safari: Share → Add to Home Screen; Chrome: Install app).

## Roadmap

- Phase 2: taste profiles from your swipes and thumbs, a "For you" page with reasons, and a personalized deck.
- Phase 3: "Tonight" mode for both of you, critic scores from OMDb, mood/runtime filters.
- Phase 4: new-season alerts, taste profile page, natural-language requests.

This product uses the TMDB API but is not endorsed or certified by TMDB.
