# watch-list

A private PWA for two people to track what we watch and pick what to watch next.

**Phase 1 (this version):** swipe through movies and shows, log what you've watched, thumbs up/down, TV episode progress, and a shared watchlist where titles you both want sit at the top. Streaming services (Netflix, Prime Video and Disney+ to start) can be switched on and off in Settings, and availability is for Canada.

Runs entirely on Cloudflare's free tier: one Worker serves the React app and the `/api` routes, with a D1 (SQLite) database. Sign-in is one shared password: each of you picks your name once and stays signed in on that device. Title data comes from [TMDB](https://www.themoviedb.org/), streaming availability from TMDB's JustWatch data.

## How it works

| Screen | What it does |
| --- | --- |
| Discover | Card deck. Swipe right = Want, left = Pass, up = Seen it (then thumbs up/down). Titles your partner wants show up first, with a badge, and a shared Want shows a match. Filters: movies/shows, genre, only on our services. Undo button for mis-swipes. |
| Watchlist | Everything either of you wants. Both-want titles first, then by rating. "Continue watching" for shows in progress. Filter by type or by your services. |
| Search | Find any movie or show and add it with one tap. |
| Title page | Details, cast, where it streams, your thumbs and your partner's, mark watched (who, when, rewatch), log TV episodes or mark a show finished. |
| Watched | Everything you've finished, newest first, with both of your ratings. |
| Settings | Your display name, streaming services on/off, sign out. |

Code layout:

- `src/` – React app (Vite, Tailwind, `vite-plugin-pwa`)
- `worker/` – Cloudflare Worker API (Hono), TMDB client, password sign-in
- `shared/` – types and pure ranking helpers used by both
- `migrations/` – D1 schema
- `scripts/mock-tmdb.mjs` – fake TMDB for local dev without an API key

## Local development

```sh
npm install
cp .dev.vars.example .dev.vars      # add your TMDB token, or use the mock below
npx wrangler login                   # dev talks to the deployed D1 database
npm run dev                          # http://localhost:5173
```

The `DB` binding in `wrangler.jsonc` has `"remote": true`, so local dev reads and writes the **real** database: anything you swipe or log locally shows up in the deployed app. Apply new migrations with `npm run db:migrate:remote`. To work against a throwaway local copy instead, remove `"remote": true` and run `npm run db:migrate:local`.

No TMDB key yet? Run the mock and point the app at it:

```sh
node scripts/mock-tmdb.mjs 4010
# in .dev.vars:
# TMDB_TOKEN=mock
# TMDB_API_BASE=http://localhost:4010/3
```

Sign in with the `APP_PASSWORD` from `.dev.vars`. To test matching as both people, sign out in Settings and sign back in as someone else (or use a private window).

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
3. Add two secrets, the TMDB token and the password you'll both use to sign in:
   ```sh
   npx wrangler secret put TMDB_TOKEN
   npx wrangler secret put APP_PASSWORD
   ```
4. Deploy: `npm run deploy` (builds, applies migrations, deploys). Note the URL it prints.
5. Open the URL, pick "Someone new", type your name and the password. Your partner does the same on their phone. You each stay signed in for a year; changing `APP_PASSWORD` signs everyone out.
6. On each phone, open the URL and add it to the home screen (Safari: Share → Add to Home Screen; Chrome: Install app).

## Roadmap

- Phase 2: taste profiles from your swipes and thumbs, a "For you" page with reasons, and a personalized deck.
- Phase 3: "Tonight" mode for both of you, critic scores from OMDb, mood/runtime filters.
- Phase 4: new-season alerts, taste profile page, natural-language requests.

This product uses the TMDB API but is not endorsed or certified by TMDB.
