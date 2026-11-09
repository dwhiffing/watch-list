import { Hono } from "hono";
import type {
  DeckCard,
  HistoryEntry,
  Member,
  MeResponse,
  SessionInfo,
  SearchResult,
  SwipeChoice,
  Thumb,
  TitleDetail,
  TitleType,
  WatchlistItem,
} from "../shared/types";
import { interleave, latestEpisode, rankWatchlist } from "../shared/ranking";
import {
  clearCookieHeader,
  isConfigured,
  memberIdFromRequest,
  passwordMatches,
  sessionCookieHeader,
  sessionToken,
} from "./auth";
import {
  castFor,
  enabledProviderIds,
  ensureDetails,
  eventsFor,
  getTitle,
  inList,
  listMembers,
  listServices,
  ratingsFor,
  refreshAvailability,
  safeJson,
  servicesForTitles,
  swipesFor,
  toEvent,
  toSummary,
  upsertTitles,
  type TitleRow,
  type WatchEventRow,
} from "./db";
import type { Env } from "./env";
import { Tmdb, TmdbError, type TmdbPage, type TitleInput } from "./tmdb";

type Vars = { me: Member; tmdb: Tmdb };
const app = new Hono<{ Bindings: Env; Variables: Vars }>().basePath("/api");

app.onError((err, c) => {
  console.error(err);
  if (err instanceof TmdbError) return c.json({ error: "TMDB request failed", status: err.status }, 502);
  return c.json({ error: err.message || "Server error" }, 500);
});

// ---------- sign-in (no session needed) ----------

const MAX_MEMBERS = 6;

app.get("/session", async (c) => {
  const body: SessionInfo = { configured: isConfigured(c.env), members: await listMembers(c.env.DB) };
  return c.json(body);
});

app.post("/login", async (c) => {
  if (!isConfigured(c.env)) return c.json({ error: "Set the APP_PASSWORD secret first (see README)." }, 503);
  const { password, memberId, name } = await c.req.json<{ password?: string; memberId?: number; name?: string }>();
  if (!passwordMatches(password ?? "", c.env)) {
    await new Promise((r) => setTimeout(r, 500)); // slow down guessing a little
    return c.json({ error: "Wrong password" }, 401);
  }
  const db = c.env.DB;
  let member: Member | null = null;
  if (memberId) {
    member = await db.prepare("SELECT id, name FROM member WHERE id = ?").bind(memberId).first<Member>();
  } else {
    const clean = name?.trim().slice(0, 40);
    if (!clean) return c.json({ error: "Pick your name or type a new one" }, 400);
    member = await db.prepare("SELECT id, name FROM member WHERE login = ?").bind(clean.toLowerCase()).first<Member>();
    if (!member) {
      const count = await db.prepare("SELECT COUNT(*) AS n FROM member").first<{ n: number }>();
      if ((count?.n ?? 0) >= MAX_MEMBERS) return c.json({ error: "Too many people already" }, 400);
      member = await db
        .prepare("INSERT INTO member (login, name) VALUES (?, ?) RETURNING id, name")
        .bind(clean.toLowerCase(), clean)
        .first<Member>();
    }
  }
  if (!member) return c.json({ error: "Unknown person" }, 404);
  c.header("Set-Cookie", sessionCookieHeader(await sessionToken(member.id, c.env), c.req.raw));
  return c.json({ ok: true, me: member });
});

app.post("/logout", (c) => {
  c.header("Set-Cookie", clearCookieHeader());
  return c.json({ ok: true });
});

// ---------- everything below needs a session ----------

app.use("*", async (c, next) => {
  const id = await memberIdFromRequest(c.req.raw, c.env);
  const me = id ? await c.env.DB.prepare("SELECT id, name FROM member WHERE id = ?").bind(id).first<Member>() : null;
  if (!me) return c.json({ error: "Not signed in" }, 401);
  c.set("me", me);
  c.set("tmdb", new Tmdb(c.env.TMDB_TOKEN, c.env.TMDB_API_BASE || undefined));
  await next();
});

const region = (env: Env) => (env.REGION || "CA").toUpperCase();

// ---------- me ----------

app.get("/me", async (c) => {
  const body: MeResponse = {
    me: c.get("me"),
    members: await listMembers(c.env.DB),
    region: region(c.env),
  };
  return c.json(body);
});

app.patch("/me", async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  const clean = name?.trim().slice(0, 40);
  if (!clean) return c.json({ error: "Name is required" }, 400);
  const taken = await c.env.DB.prepare("SELECT id FROM member WHERE login = ? AND id != ?")
    .bind(clean.toLowerCase(), c.get("me").id)
    .first();
  if (taken) return c.json({ error: "Someone already has that name" }, 400);
  await c.env.DB.prepare("UPDATE member SET name = ?, login = ? WHERE id = ?").bind(clean, clean.toLowerCase(), c.get("me").id).run();
  return c.json({ ok: true });
});

// ---------- genres ----------

app.get("/genres", async (c) => {
  const tmdb = c.get("tmdb");
  const [movie, tv] = await Promise.all([tmdb.genres("movie"), tmdb.genres("tv")]);
  const names = [...new Set([...movie.values(), ...tv.values()])].sort();
  return c.json({ genres: names });
});

// ---------- swipe deck ----------

const DECK_SIZE = 15;
const MAX_PAGES_PER_REQUEST = 4;

app.get("/deck", async (c) => {
  const db = c.env.DB;
  const me = c.get("me");
  const tmdb = c.get("tmdb");
  const media = (c.req.query("media") ?? "all") as "all" | TitleType;
  const genre = c.req.query("genre") ?? "";
  const onlyServices = c.req.query("services") === "1";
  const exclude = new Set((c.req.query("exclude") ?? "").split(",").filter(Boolean).map(Number));
  const types: TitleType[] = media === "all" ? ["movie", "tv"] : [media];
  const reg = region(c.env);

  const providerIds = onlyServices ? await enabledProviderIds(db) : [];
  if (onlyServices && providerIds.length === 0) return c.json({ cards: [], exhausted: true });

  // TMDB genre ids differ between movies and TV, so map the chosen genre name to each.
  const genreIds = new Map<TitleType, number | null>();
  for (const t of types) {
    if (!genre) genreIds.set(t, null);
    else {
      const map = await tmdb.genres(t);
      const id = [...map.entries()].find(([, n]) => n === genre)?.[0];
      if (id !== undefined) genreIds.set(t, id);
    }
  }
  const activeTypes = types.filter((t) => genreIds.has(t));

  const cards: DeckCard[] = [];
  const cardIds = new Set<number>();
  const members = await listMembers(db);

  // 1. Titles someone else wants that you haven't swiped yet come first, so matches happen quickly.
  const { results: partnerWants } = await db
    .prepare(
      `SELECT t.* FROM title t JOIN swipe s ON s.title_id = t.id AND s.choice = 'want' AND s.member_id != ?
       WHERE NOT EXISTS (SELECT 1 FROM swipe m WHERE m.title_id = t.id AND m.member_id = ?)
         AND t.type IN (${inList(activeTypes.length || 1)})
       GROUP BY t.id ORDER BY MAX(s.swiped_at) DESC LIMIT 5`,
    )
    .bind(me.id, me.id, ...(activeTypes.length ? activeTypes : ["none"]))
    .all<TitleRow>();
  const filteredPartnerWants = partnerWants.filter(
    (r) => !exclude.has(r.id) && (!genre || safeJson<string[]>(r.genres, []).includes(genre)),
  );

  // 2. Fresh titles from TMDB: popular and top-rated, movies and shows interleaved.
  const deckKey = `${media}|${genre}|${onlyServices ? providerIds.join("-") : ""}`;
  const cursor = await db
    .prepare("SELECT page FROM deck_cursor WHERE member_id = ? AND deck_key = ?")
    .bind(me.id, deckKey)
    .first<{ page: number }>();
  let page = cursor?.page ?? 1;
  let firstIncompletePage: number | null = null;
  let exhausted = false;
  const fresh: TitleRow[] = [];

  for (let i = 0; i < MAX_PAGES_PER_REQUEST && fresh.length < DECK_SIZE && activeTypes.length; i++, page++) {
    const lists = await Promise.all(
      activeTypes.flatMap((t) =>
        (["popular", "top"] as const).map(async (kind) => {
          const params: Record<string, string | number | undefined> = {
            page,
            include_adult: "false",
            sort_by: kind === "popular" ? "popularity.desc" : "vote_average.desc",
            "vote_count.gte": kind === "popular" ? 100 : t === "movie" ? 1500 : 400,
            with_genres: genreIds.get(t) ?? undefined,
            watch_region: reg,
          };
          if (onlyServices) {
            params.with_watch_providers = providerIds.join("|");
            params.with_watch_monetization_types = "flatrate|ads";
          }
          const data = await tmdb.get<TmdbPage>(`/discover/${t}`, params);
          return { data, type: t };
        }),
      ),
    );
    if (lists.every((l) => l.data.results.length === 0 || page > l.data.total_pages)) {
      exhausted = true;
      break;
    }
    const inputs: TitleInput[] = [];
    const normalized = await Promise.all(lists.map(async (l) => Promise.all(l.data.results.map((r) => tmdb.normalize(r, l.type)))));
    inputs.push(...interleave(normalized, (t) => `${t.type}:${t.tmdbId}`));
    const rows = await upsertTitles(db, inputs);
    const swiped = await swipesFor(db, rows.map((r) => r.id));
    const unswiped = rows.filter((r) => !swiped.get(r.id)?.has(me.id));
    if (unswiped.length > 0 && firstIncompletePage === null) firstIncompletePage = page;
    fresh.push(...unswiped.filter((r) => !exclude.has(r.id)));
  }

  // Remember the first page that still has cards you haven't swiped, so nothing gets skipped.
  const nextCursor = firstIncompletePage ?? page;
  if (nextCursor !== cursor?.page) {
    await db
      .prepare(
        `INSERT INTO deck_cursor (member_id, deck_key, page) VALUES (?, ?, ?)
         ON CONFLICT(member_id, deck_key) DO UPDATE SET page = excluded.page`,
      )
      .bind(me.id, deckKey, nextCursor)
      .run();
  }

  const all = [...filteredPartnerWants, ...fresh];
  const swipes = await swipesFor(db, all.map((r) => r.id));
  for (const row of all) {
    if (cardIds.has(row.id) || cards.length >= DECK_SIZE) continue;
    cardIds.add(row.id);
    const s = swipes.get(row.id);
    cards.push({
      ...toSummary(row),
      wantedBy: members.filter((m) => m.id !== me.id && s?.get(m.id) === "want").map((m) => m.id),
    });
  }
  return c.json({ cards, exhausted: exhausted && cards.length === 0 });
});

// ---------- swipes ----------

app.post("/swipes", async (c) => {
  const db = c.env.DB;
  const me = c.get("me");
  const { titleId, choice, thumb, source } = await c.req.json<{
    titleId: number;
    choice: SwipeChoice;
    thumb?: Thumb | null;
    source?: "deck" | "manual";
  }>();
  if (!["want", "pass", "seen"].includes(choice)) return c.json({ error: "Bad choice" }, 400);
  const title = await getTitle(db, titleId);
  if (!title) return c.json({ error: "Unknown title" }, 404);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO swipe (member_id, title_id, choice, source) VALUES (?, ?, ?, ?)
         ON CONFLICT(member_id, title_id) DO UPDATE SET choice = excluded.choice, source = excluded.source, swiped_at = datetime('now')`,
      )
      .bind(me.id, titleId, choice, source === "manual" ? "manual" : "deck"),
  ];
  if (choice === "seen") {
    if (thumb === 1 || thumb === -1) statements.push(ratingStatement(db, me.id, titleId, thumb));
    // "Seen it" = watched before; record it once, with no date.
    statements.push(
      db
        .prepare(
          `INSERT INTO watch_event (title_id, member_ids, created_by)
           SELECT ?, ?, ? WHERE NOT EXISTS (
             SELECT 1 FROM watch_event WHERE title_id = ? AND season IS NULL AND EXISTS (SELECT 1 FROM json_each(member_ids) WHERE value = ?)
           )`,
        )
        .bind(titleId, JSON.stringify([me.id]), me.id, titleId, me.id),
    );
  }
  await db.batch(statements);

  let match = false;
  if (choice === "want") {
    const other = await db
      .prepare("SELECT COUNT(*) AS n FROM swipe WHERE title_id = ? AND choice = 'want' AND member_id != ?")
      .bind(titleId, me.id)
      .first<{ n: number }>();
    match = (other?.n ?? 0) > 0;
  }
  return c.json({ ok: true, match });
});

/** Undo a swipe (and the "seen it" rating/event it created). */
app.delete("/swipes/:titleId", async (c) => {
  const db = c.env.DB;
  const me = c.get("me");
  const titleId = Number(c.req.param("titleId"));
  const prev = await db
    .prepare("SELECT choice FROM swipe WHERE member_id = ? AND title_id = ?")
    .bind(me.id, titleId)
    .first<{ choice: SwipeChoice }>();
  const statements = [db.prepare("DELETE FROM swipe WHERE member_id = ? AND title_id = ?").bind(me.id, titleId)];
  if (prev?.choice === "seen") {
    statements.push(db.prepare("DELETE FROM rating WHERE member_id = ? AND title_id = ?").bind(me.id, titleId));
    statements.push(
      db
        .prepare("DELETE FROM watch_event WHERE title_id = ? AND created_by = ? AND watched_on IS NULL AND season IS NULL AND member_ids = ?")
        .bind(titleId, me.id, JSON.stringify([me.id])),
    );
  }
  await db.batch(statements);
  return c.json({ ok: true });
});

function ratingStatement(db: D1Database, memberId: number, titleId: number, thumb: Thumb, note?: string | null) {
  return db
    .prepare(
      `INSERT INTO rating (member_id, title_id, thumb, note) VALUES (?, ?, ?, ?)
       ON CONFLICT(member_id, title_id) DO UPDATE SET thumb = excluded.thumb, note = COALESCE(excluded.note, rating.note), rated_at = datetime('now')`,
    )
    .bind(memberId, titleId, thumb, note ?? null);
}

// ---------- watchlist ----------

app.get("/watchlist", async (c) => {
  const db = c.env.DB;
  const tmdb = c.get("tmdb");
  const reg = region(c.env);

  // Wanted by anyone, and not marked as fully watched.
  const { results: wanted } = await db
    .prepare(
      `SELECT t.*, MAX(s.swiped_at) AS added_at FROM title t JOIN swipe s ON s.title_id = t.id AND s.choice = 'want'
       WHERE NOT EXISTS (SELECT 1 FROM watch_event e WHERE e.title_id = t.id AND e.season IS NULL)
       GROUP BY t.id`,
    )
    .all<TitleRow & { added_at: string }>();

  // TV shows with episode progress that aren't finished.
  const { results: watching } = await db
    .prepare(
      `SELECT t.*, MAX(e.created_at) AS added_at FROM title t JOIN watch_event e ON e.title_id = t.id AND e.season IS NOT NULL
       WHERE t.type = 'tv' AND NOT EXISTS (SELECT 1 FROM watch_event f WHERE f.title_id = t.id AND f.season IS NULL)
       GROUP BY t.id ORDER BY added_at DESC`,
    )
    .all<TitleRow & { added_at: string }>();

  const allRows = [...wanted, ...watching];
  await refreshAvailability(db, tmdb, allRows, reg);
  const ids = allRows.map((r) => r.id);
  const [swipes, services] = await Promise.all([swipesFor(db, ids), servicesForTitles(db, ids, reg)]);

  const progressByTitle = new Map<number, { season: number; episode: number } | null>();
  if (watching.length) {
    const { results: eps } = await db
      .prepare(`SELECT title_id, season, episode FROM watch_event WHERE season IS NOT NULL AND title_id IN (${inList(watching.length)})`)
      .bind(...watching.map((w) => w.id))
      .all<{ title_id: number; season: number; episode: number }>();
    for (const w of watching) progressByTitle.set(w.id, latestEpisode(eps.filter((e) => e.title_id === w.id)));
  }

  const toItem = (row: TitleRow & { added_at: string }): WatchlistItem => {
    const s = swipes.get(row.id);
    return {
      ...toSummary(row),
      wantedBy: s ? [...s.entries()].filter(([, ch]) => ch === "want").map(([m]) => m) : [],
      services: services.get(row.id) ?? [],
      progress: progressByTitle.get(row.id) ?? null,
      addedAt: row.added_at,
    };
  };

  const watchingIds = new Set(watching.map((w) => w.id));
  return c.json({
    watching: watching.map(toItem),
    items: rankWatchlist(wanted.filter((w) => !watchingIds.has(w.id)).map(toItem)),
  });
});

// ---------- search ----------

app.get("/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json({ results: [] });
  const db = c.env.DB;
  const me = c.get("me");
  const tmdb = c.get("tmdb");
  const data = await tmdb.get<TmdbPage>("/search/multi", { query: q, include_adult: "false" }, 60 * 30);
  const items = data.results.filter((r) => r.media_type === "movie" || r.media_type === "tv").slice(0, 20);
  const inputs = await Promise.all(items.map((r) => tmdb.normalize(r, r.media_type as TitleType)));
  const rows = await upsertTitles(db, inputs);
  const swipes = await swipesFor(db, rows.map((r) => r.id));
  const results: SearchResult[] = rows.map((row) => {
    const s = swipes.get(row.id);
    return {
      ...toSummary(row),
      mySwipe: s?.get(me.id) ?? null,
      onWatchlist: s ? [...s.values()].includes("want") : false,
    };
  });
  return c.json({ results });
});

// ---------- title detail ----------

app.get("/titles/:id", async (c) => {
  const db = c.env.DB;
  const id = Number(c.req.param("id"));
  const reg = region(c.env);
  const existing = await getTitle(db, id);
  if (!existing) return c.json({ error: "Not found" }, 404);
  const row = await ensureDetails(db, c.get("tmdb"), existing, reg);
  const [{ cast, directors }, swipes, ratings, events, services] = await Promise.all([
    castFor(db, id),
    swipesFor(db, [id]),
    ratingsFor(db, [id]),
    eventsFor(db, id),
    servicesForTitles(db, [id], reg),
  ]);
  const detail: TitleDetail = {
    ...toSummary(row),
    keywords: safeJson<string[]>(row.keywords, []),
    cast,
    directors,
    seasons: row.type === "tv" ? safeJson(row.seasons, []) : null,
    services: services.get(id) ?? [],
    swipes: Object.fromEntries(swipes.get(id) ?? []),
    ratings: ratings.get(id) ?? {},
    events,
    progress: latestEpisode(events),
    finished: events.some((e) => e.season == null),
  };
  return c.json(detail);
});

app.put("/titles/:id/rating", async (c) => {
  const db = c.env.DB;
  const me = c.get("me");
  const id = Number(c.req.param("id"));
  const { thumb, note } = await c.req.json<{ thumb: Thumb | null; note?: string }>();
  if (thumb === null) {
    await db.prepare("DELETE FROM rating WHERE member_id = ? AND title_id = ?").bind(me.id, id).run();
  } else if (thumb === 1 || thumb === -1) {
    await ratingStatement(db, me.id, id, thumb, note).run();
  } else {
    return c.json({ error: "thumb must be 1, -1 or null" }, 400);
  }
  return c.json({ ok: true });
});

/** Remove a title from the shared watchlist: everyone's Want becomes a Pass. */
app.delete("/titles/:id/watchlist", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("UPDATE swipe SET choice = 'pass', swiped_at = datetime('now') WHERE title_id = ? AND choice = 'want'").bind(id).run();
  return c.json({ ok: true });
});

/** Log a viewing. Without season/episode it marks the whole movie or show as watched. */
app.post("/titles/:id/watched", async (c) => {
  const db = c.env.DB;
  const me = c.get("me");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{
    memberIds?: number[];
    watchedOn?: string | null;
    season?: number | null;
    episode?: number | null;
    isRewatch?: boolean;
  }>();
  const title = await getTitle(db, id);
  if (!title) return c.json({ error: "Not found" }, 404);
  const memberIds = body.memberIds?.length ? body.memberIds : [me.id];
  const watchedOn = body.watchedOn === undefined ? new Date().toISOString().slice(0, 10) : body.watchedOn;
  if (watchedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(watchedOn)) return c.json({ error: "watchedOn must be YYYY-MM-DD" }, 400);
  const isEpisode = title.type === "tv" && body.season != null && body.episode != null;
  const row = await db
    .prepare(
      `INSERT INTO watch_event (title_id, member_ids, watched_on, season, episode, is_rewatch, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    )
    .bind(id, JSON.stringify(memberIds), watchedOn, isEpisode ? body.season : null, isEpisode ? body.episode : null, body.isRewatch ? 1 : 0, me.id)
    .first<WatchEventRow>();
  return c.json({ event: row ? toEvent(row) : null });
});

app.delete("/watch-events/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM watch_event WHERE id = ?").bind(Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

// ---------- history ----------

app.get("/history", async (c) => {
  const db = c.env.DB;
  const { results } = await db
    .prepare(
      `SELECT e.id AS e_id, e.member_ids, e.watched_on, e.season, e.episode, e.is_rewatch, t.*
       FROM watch_event e JOIN title t ON t.id = e.title_id
       WHERE e.season IS NULL
       ORDER BY COALESCE(e.watched_on, substr(e.created_at, 1, 10)) DESC, e.id DESC LIMIT 200`,
    )
    .all<TitleRow & { e_id: number; member_ids: string; watched_on: string | null; season: number | null; episode: number | null; is_rewatch: number }>();
  const ratings = await ratingsFor(db, [...new Set(results.map((r) => r.id))]);
  const entries: HistoryEntry[] = results.map((r) => ({
    event: toEvent({ id: r.e_id, title_id: r.id, member_ids: r.member_ids, watched_on: r.watched_on, season: r.season, episode: r.episode, is_rewatch: r.is_rewatch }),
    title: toSummary(r),
    ratings: ratings.get(r.id) ?? {},
  }));
  return c.json({ entries });
});

// ---------- settings ----------

app.get("/services", async (c) => {
  const db = c.env.DB;
  let services = await listServices(db);
  if (services.some((s) => !s.logoPath)) {
    // Fill in logos from TMDB's provider list for the region.
    try {
      const data = await c.get("tmdb").get<{ results: { provider_id: number; logo_path: string }[] }>(
        "/watch/providers/movie",
        { watch_region: region(c.env) },
        60 * 60 * 24 * 7,
      );
      const logos = new Map(data.results.map((p) => [p.provider_id, p.logo_path]));
      const updates = services
        .filter((s) => !s.logoPath)
        .map((s) => ({ s, logo: s.providerIds.map((p) => logos.get(p)).find(Boolean) }))
        .filter((u) => u.logo);
      if (updates.length) {
        await db.batch(updates.map((u) => db.prepare("UPDATE streaming_service SET logo_path = ? WHERE id = ?").bind(u.logo!, u.s.id)));
        services = await listServices(db);
      }
    } catch (err) {
      console.warn("Could not load provider logos", err);
    }
  }
  return c.json({ services });
});

app.patch("/services/:id", async (c) => {
  const { enabled } = await c.req.json<{ enabled: boolean }>();
  await c.env.DB.prepare("UPDATE streaming_service SET enabled = ? WHERE id = ?")
    .bind(enabled ? 1 : 0, Number(c.req.param("id")))
    .run();
  return c.json({ ok: true });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Env>;

export { app };
