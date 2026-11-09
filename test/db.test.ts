import { describe, expect, it } from "vitest";
import { upsertTitles, type TitleRow } from "../worker/db";
import type { TitleInput } from "../worker/tmdb";

const input = (tmdbId: number): TitleInput => ({
  tmdbId,
  type: "movie",
  name: `Movie ${tmdbId}`,
  year: 2020,
  overview: null,
  posterPath: null,
  backdropPath: null,
  genres: [],
  voteAverage: null,
  voteCount: null,
  popularity: null,
});

const row = (id: number, tmdbId: number, refreshedAt: string) => ({ id, tmdb_id: tmdbId, type: "movie", name: `Movie ${tmdbId}`, refreshed_at: refreshedAt }) as TitleRow;

describe("upsertTitles", () => {
  it("only writes titles that are new or stale, and returns every row in order", async () => {
    const now = new Date().toISOString().slice(0, 19).replace("T", " ");
    const stored = [row(1, 100, now), row(2, 200, "2000-01-01 00:00:00")];
    const written: unknown[][] = [];
    let nextId = 3;
    const db = {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) =>
          sql.startsWith("SELECT")
            ? { all: async () => ({ results: stored.filter((r) => args.includes(r.tmdb_id)) }) }
            : { args },
      }),
      batch: async (stmts: { args: unknown[] }[]) =>
        stmts.map(({ args }) => {
          written.push(args);
          const tmdbId = args[0] as number;
          return { results: [row(stored.find((r) => r.tmdb_id === tmdbId)?.id ?? nextId++, tmdbId, now)] };
        }),
    } as unknown as D1Database;

    const rows = await upsertTitles(db, [input(100), input(200), input(300)]);

    expect(written.map((args) => args[0])).toEqual([200, 300]); // 100 was refreshed just now, so it's left alone
    expect(rows.map((r) => r.tmdb_id)).toEqual([100, 200, 300]);
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});
