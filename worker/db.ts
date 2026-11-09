import type {
  CastMember,
  Member,
  StreamingService,
  SwipeChoice,
  Thumb,
  TitleSummary,
  TitleType,
  WatchEvent,
} from "../shared/types";
import { streamingProviderIds, type Tmdb, type TitleInput, type TmdbDetails } from "./tmdb";

export interface TitleRow {
  id: number;
  tmdb_id: number;
  type: TitleType;
  name: string;
  year: number | null;
  runtime: number | null;
  overview: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  genres: string;
  keywords: string;
  vote_average: number | null;
  vote_count: number | null;
  popularity: number | null;
  seasons: string | null;
  details_at: string | null;
  refreshed_at: string;
}

interface WatchEventRow {
  id: number;
  title_id: number;
  member_ids: string;
  watched_on: string | null;
  season: number | null;
  episode: number | null;
  is_rewatch: number;
}

const LIST_MAX_AGE_DAYS = 1; // how often list-level fields (votes, popularity, posters) get rewritten
const DETAILS_MAX_AGE_DAYS = 7;
const AVAILABILITY_MAX_AGE_DAYS = 3;

export function toSummary(row: TitleRow): TitleSummary {
  return {
    id: row.id,
    tmdbId: row.tmdb_id,
    type: row.type,
    name: row.name,
    year: row.year,
    overview: row.overview,
    posterPath: row.poster_path,
    backdropPath: row.backdrop_path,
    genres: safeJson<string[]>(row.genres, []),
    voteAverage: row.vote_average,
    voteCount: row.vote_count,
    runtime: row.runtime,
  };
}

export function toEvent(row: WatchEventRow): WatchEvent {
  return {
    id: row.id,
    memberIds: safeJson<number[]>(row.member_ids, []),
    watchedOn: row.watched_on,
    season: row.season,
    episode: row.episode,
    isRewatch: row.is_rewatch === 1,
  };
}

export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** Placeholders for an IN (...) clause. */
export function inList(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

// ---------- members ----------

export async function listMembers(db: D1Database): Promise<Member[]> {
  const { results } = await db.prepare("SELECT id, name FROM member ORDER BY id").all<Member>();
  return results;
}

// ---------- titles ----------

/**
 * Insert or refresh list-level fields for many titles. Returns rows in the same order.
 * Titles already stored and refreshed within LIST_MAX_AGE_DAYS are only read, not rewritten,
 * since D1 writes are the scarcest part of the free tier.
 */
export async function upsertTitles(db: D1Database, inputs: TitleInput[]): Promise<TitleRow[]> {
  if (inputs.length === 0) return [];
  const key = (type: TitleType, tmdbId: number) => `${type}:${tmdbId}`;
  const rows = new Map<string, TitleRow>();
  const tmdbIds = [...new Set(inputs.map((t) => t.tmdbId))];
  for (let i = 0; i < tmdbIds.length; i += 90) {
    // D1 allows 100 bound parameters per query
    const chunk = tmdbIds.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT * FROM title WHERE tmdb_id IN (${inList(chunk.length)})`)
      .bind(...chunk)
      .all<TitleRow>();
    for (const r of results) rows.set(key(r.type, r.tmdb_id), r);
  }

  const toWrite = new Map<string, TitleInput>();
  for (const t of inputs) {
    const existing = rows.get(key(t.type, t.tmdbId));
    if (!existing || isStale(existing.refreshed_at, LIST_MAX_AGE_DAYS)) toWrite.set(key(t.type, t.tmdbId), t);
  }
  if (toWrite.size > 0) {
    for (const row of await writeTitles(db, [...toWrite.values()])) rows.set(key(row.type, row.tmdb_id), row);
  }
  return inputs.map((t) => rows.get(key(t.type, t.tmdbId))!);
}

async function writeTitles(db: D1Database, inputs: TitleInput[]): Promise<TitleRow[]> {
  const stmt = db.prepare(
    `INSERT INTO title (tmdb_id, type, name, year, overview, poster_path, backdrop_path, genres, vote_average, vote_count, popularity, refreshed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(tmdb_id, type) DO UPDATE SET
       name = excluded.name,
       year = excluded.year,
       overview = COALESCE(excluded.overview, title.overview),
       poster_path = COALESCE(excluded.poster_path, title.poster_path),
       backdrop_path = COALESCE(excluded.backdrop_path, title.backdrop_path),
       genres = CASE WHEN excluded.genres = '[]' THEN title.genres ELSE excluded.genres END,
       vote_average = excluded.vote_average,
       vote_count = excluded.vote_count,
       popularity = excluded.popularity,
       refreshed_at = excluded.refreshed_at
     RETURNING *`,
  );
  const results = await db.batch<TitleRow>(
    inputs.map((t) =>
      stmt.bind(
        t.tmdbId,
        t.type,
        t.name,
        t.year,
        t.overview,
        t.posterPath,
        t.backdropPath,
        JSON.stringify(t.genres),
        t.voteAverage,
        t.voteCount,
        t.popularity,
      ),
    ),
  );
  return results.map((r) => r.results[0]);
}

export async function getTitle(db: D1Database, id: number): Promise<TitleRow | null> {
  return db.prepare("SELECT * FROM title WHERE id = ?").bind(id).first<TitleRow>();
}

function isStale(timestamp: string | null, maxAgeDays: number): boolean {
  if (!timestamp) return true;
  const t = Date.parse(timestamp.replace(" ", "T") + "Z");
  return Number.isNaN(t) || Date.now() - t > maxAgeDays * 86_400_000;
}

/** Fetch full details (runtime, seasons, credits, keywords, availability) when missing or stale. */
export async function ensureDetails(db: D1Database, tmdb: Tmdb, row: TitleRow, region: string): Promise<TitleRow> {
  if (!isStale(row.details_at, DETAILS_MAX_AGE_DAYS)) return row;
  const d = await tmdb.details(row.type, row.tmdb_id);
  await saveDetails(db, row, d, region);
  return (await getTitle(db, row.id)) ?? row;
}

async function saveDetails(db: D1Database, row: TitleRow, d: TmdbDetails, region: string): Promise<void> {
  const runtime = row.type === "movie" ? (d.runtime ?? null) : (d.episode_run_time?.[0] ?? null);
  const seasons =
    row.type === "tv"
      ? JSON.stringify(
          (d.seasons ?? [])
            .filter((s) => s.season_number > 0 && s.episode_count > 0)
            .map((s) => ({ season: s.season_number, episodes: s.episode_count })),
        )
      : null;
  const keywords = (d.keywords?.keywords ?? d.keywords?.results ?? []).map((k) => k.name).slice(0, 30);
  const genres = (d.genres ?? []).map((g) => g.name);

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE title SET runtime = ?, seasons = ?, keywords = ?, genres = CASE WHEN ? = '[]' THEN genres ELSE ? END,
           overview = COALESCE(?, overview), details_at = datetime('now') WHERE id = ?`,
      )
      .bind(runtime, seasons, JSON.stringify(keywords), JSON.stringify(genres), JSON.stringify(genres), d.overview || null, row.id),
    db.prepare("DELETE FROM credit WHERE title_id = ?").bind(row.id),
  ];

  type Credit = { tmdbId: number; name: string; profile: string | null; role: string; order: number; character: string | null };
  const credits: Credit[] = [];
  for (const c of (d.credits?.cast ?? []).slice(0, 12)) {
    credits.push({ tmdbId: c.id, name: c.name, profile: c.profile_path, role: "cast", order: c.order ?? credits.length, character: c.character ?? null });
  }
  for (const c of d.credits?.crew ?? []) {
    if (c.job === "Director") credits.push({ tmdbId: c.id, name: c.name, profile: c.profile_path, role: "director", order: 0, character: null });
    else if (c.job === "Screenplay" || c.job === "Writer")
      credits.push({ tmdbId: c.id, name: c.name, profile: c.profile_path, role: "writer", order: 0, character: null });
  }
  for (const c of d.created_by ?? []) {
    credits.push({ tmdbId: c.id, name: c.name, profile: c.profile_path, role: "creator", order: 0, character: null });
  }
  const seen = new Set<string>();
  const uniqueCredits = credits.filter((c) => {
    const k = `${c.tmdbId}:${c.role}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const personStmt = db.prepare(
    `INSERT INTO person (tmdb_id, name, profile_path) VALUES (?, ?, ?)
     ON CONFLICT(tmdb_id) DO UPDATE SET name = excluded.name, profile_path = excluded.profile_path`,
  );
  const creditStmt = db.prepare(
    `INSERT OR IGNORE INTO credit (title_id, person_id, role, billing_order, character)
     SELECT ?, id, ?, ?, ? FROM person WHERE tmdb_id = ?`,
  );
  for (const c of uniqueCredits) {
    statements.push(personStmt.bind(c.tmdbId, c.name, c.profile));
    statements.push(creditStmt.bind(row.id, c.role, c.order, c.character, c.tmdbId));
  }
  statements.push(...availabilityStatements(db, row.id, streamingProviderIds(d["watch/providers"], region), region));
  await db.batch(statements);
}

function availabilityStatements(db: D1Database, titleId: number, providerIds: number[], region: string): D1PreparedStatement[] {
  return [
    db.prepare("DELETE FROM title_availability WHERE title_id = ? AND region = ?").bind(titleId, region),
    ...providerIds.map((p) =>
      db.prepare("INSERT OR IGNORE INTO title_availability (title_id, provider_id, region) VALUES (?, ?, ?)").bind(titleId, p, region),
    ),
    db
      .prepare(
        `INSERT INTO availability_check (title_id, region, checked_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(title_id, region) DO UPDATE SET checked_at = excluded.checked_at`,
      )
      .bind(titleId, region),
  ];
}

/** Refresh streaming availability for titles not checked recently. Caps TMDB calls per request. */
export async function refreshAvailability(db: D1Database, tmdb: Tmdb, rows: TitleRow[], region: string, max = 20): Promise<void> {
  if (rows.length === 0) return;
  const { results } = await db
    .prepare(`SELECT title_id, checked_at FROM availability_check WHERE region = ? AND title_id IN (${inList(rows.length)})`)
    .bind(region, ...rows.map((r) => r.id))
    .all<{ title_id: number; checked_at: string }>();
  const checked = new Map(results.map((r) => [r.title_id, r.checked_at]));
  const stale = rows.filter((r) => isStale(checked.get(r.id) ?? null, AVAILABILITY_MAX_AGE_DAYS)).slice(0, max);
  if (stale.length === 0) return;
  const fetched = await Promise.allSettled(stale.map((r) => tmdb.providers(r.type, r.tmdb_id)));
  const statements: D1PreparedStatement[] = [];
  fetched.forEach((f, i) => {
    if (f.status === "fulfilled") statements.push(...availabilityStatements(db, stale[i].id, streamingProviderIds(f.value, region), region));
  });
  if (statements.length) await db.batch(statements);
}

// ---------- streaming services ----------

export async function listServices(db: D1Database): Promise<StreamingService[]> {
  const { results } = await db
    .prepare("SELECT id, name, provider_ids, logo_path, enabled FROM streaming_service ORDER BY sort_order, id")
    .all<{ id: number; name: string; provider_ids: string; logo_path: string | null; enabled: number }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    providerIds: safeJson<number[]>(r.provider_ids, []),
    logoPath: r.logo_path,
    enabled: r.enabled === 1,
  }));
}

/** service id -> list of its TMDB provider ids, enabled services only */
export async function enabledProviderIds(db: D1Database): Promise<number[]> {
  return (await listServices(db)).filter((s) => s.enabled).flatMap((s) => s.providerIds);
}

/** For each title, the enabled service ids that carry it. */
export async function servicesForTitles(db: D1Database, titleIds: number[], region: string): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (titleIds.length === 0) return out;
  const services = (await listServices(db)).filter((s) => s.enabled);
  const { results } = await db
    .prepare(`SELECT title_id, provider_id FROM title_availability WHERE region = ? AND title_id IN (${inList(titleIds.length)})`)
    .bind(region, ...titleIds)
    .all<{ title_id: number; provider_id: number }>();
  for (const r of results) {
    for (const s of services) {
      if (!s.providerIds.includes(r.provider_id)) continue;
      const list = out.get(r.title_id) ?? [];
      if (!list.includes(s.id)) list.push(s.id);
      out.set(r.title_id, list);
    }
  }
  return out;
}

// ---------- per-title state ----------

export async function swipesFor(db: D1Database, titleIds: number[]): Promise<Map<number, Map<number, SwipeChoice>>> {
  const out = new Map<number, Map<number, SwipeChoice>>();
  if (titleIds.length === 0) return out;
  const { results } = await db
    .prepare(`SELECT title_id, member_id, choice FROM swipe WHERE title_id IN (${inList(titleIds.length)})`)
    .bind(...titleIds)
    .all<{ title_id: number; member_id: number; choice: SwipeChoice }>();
  for (const r of results) {
    const m = out.get(r.title_id) ?? new Map();
    m.set(r.member_id, r.choice);
    out.set(r.title_id, m);
  }
  return out;
}

export async function ratingsFor(db: D1Database, titleIds: number[]): Promise<Map<number, Record<number, Thumb>>> {
  const out = new Map<number, Record<number, Thumb>>();
  if (titleIds.length === 0) return out;
  const { results } = await db
    .prepare(`SELECT title_id, member_id, thumb FROM rating WHERE title_id IN (${inList(titleIds.length)})`)
    .bind(...titleIds)
    .all<{ title_id: number; member_id: number; thumb: Thumb }>();
  for (const r of results) {
    const rec = out.get(r.title_id) ?? {};
    rec[r.member_id] = r.thumb;
    out.set(r.title_id, rec);
  }
  return out;
}

export async function eventsFor(db: D1Database, titleId: number): Promise<WatchEvent[]> {
  const { results } = await db
    .prepare("SELECT * FROM watch_event WHERE title_id = ? ORDER BY COALESCE(watched_on, '0000') DESC, id DESC")
    .bind(titleId)
    .all<WatchEventRow>();
  return results.map(toEvent);
}

export async function castFor(db: D1Database, titleId: number): Promise<{ cast: CastMember[]; directors: string[] }> {
  const { results } = await db
    .prepare(
      `SELECT p.name, p.profile_path, c.role, c.character FROM credit c JOIN person p ON p.id = c.person_id
       WHERE c.title_id = ? ORDER BY c.role, c.billing_order`,
    )
    .bind(titleId)
    .all<{ name: string; profile_path: string | null; role: string; character: string | null }>();
  return {
    cast: results.filter((r) => r.role === "cast").slice(0, 10).map((r) => ({ name: r.name, character: r.character, profilePath: r.profile_path })),
    directors: results.filter((r) => r.role === "director" || r.role === "creator").map((r) => r.name),
  };
}

export type { WatchEventRow };
