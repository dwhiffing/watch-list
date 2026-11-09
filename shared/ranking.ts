/**
 * Pure helpers shared by the worker and tests.
 */

/**
 * A rating that doesn't overrate titles with only a few votes
 * (IMDb-style weighted average). Stands in for the Phase 2 recommendation score.
 */
export function baseScore(voteAverage: number | null, voteCount: number | null): number {
  const v = voteCount ?? 0;
  const r = voteAverage ?? 0;
  const m = 500; // votes needed before a title's own average dominates
  const c = 6.5; // typical average across TMDB
  return (v * r + m * c) / (v + m);
}

export interface Rankable {
  wantedBy: number[];
  voteAverage: number | null;
  voteCount: number | null;
  addedAt: string;
}

/** Titles both of you want first, then by score, then newest first. */
export function rankWatchlist<T extends Rankable>(items: T[]): T[] {
  return [...items].sort(
    (a, b) =>
      b.wantedBy.length - a.wantedBy.length ||
      baseScore(b.voteAverage, b.voteCount) - baseScore(a.voteAverage, a.voteCount) ||
      b.addedAt.localeCompare(a.addedAt),
  );
}

/** Round-robin merge of several lists, dropping duplicates by key. */
export function interleave<T>(lists: T[][], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const longest = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < longest; i++) {
    for (const list of lists) {
      const item = list[i];
      if (item === undefined) continue;
      const k = key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

/** The latest episode in a list of TV watch events, or null. */
export function latestEpisode(
  events: { season: number | null; episode: number | null }[],
): { season: number; episode: number } | null {
  let best: { season: number; episode: number } | null = null;
  for (const e of events) {
    if (e.season == null || e.episode == null) continue;
    if (!best || e.season > best.season || (e.season === best.season && e.episode > best.episode)) {
      best = { season: e.season, episode: e.episode };
    }
  }
  return best;
}

/** The episode after `current`, given a season list. Null when the show is done. */
export function nextEpisode(
  seasons: { season: number; episodes: number }[],
  current: { season: number; episode: number } | null,
): { season: number; episode: number } | null {
  const sorted = [...seasons].filter((s) => s.season > 0 && s.episodes > 0).sort((a, b) => a.season - b.season);
  if (sorted.length === 0) return null;
  if (!current) return { season: sorted[0].season, episode: 1 };
  const idx = sorted.findIndex((s) => s.season === current.season);
  if (idx === -1) return null;
  if (current.episode < sorted[idx].episodes) return { season: current.season, episode: current.episode + 1 };
  const next = sorted[idx + 1];
  return next ? { season: next.season, episode: 1 } : null;
}
