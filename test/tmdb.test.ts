import { afterEach, describe, expect, it, vi } from "vitest";
import { Tmdb } from "../worker/tmdb";

describe("Tmdb.genres", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("fetches the genre list once when many titles are normalized in parallel", async () => {
    const fetchMock = vi.fn(async () => Response.json({ genres: [{ id: 18, name: "Drama" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const tmdb = new Tmdb("token");

    const items = Array.from({ length: 20 }, (_, i) => ({ id: i, title: `Movie ${i}`, genre_ids: [18] }));
    const results = await Promise.all(items.map((item) => tmdb.normalize(item, "movie")));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r.genres[0] === "Drama")).toBe(true);
  });

  it("serves a later request from the D1 cache instead of TMDB", async () => {
    const fetchMock = vi.fn(async () => Response.json({ genres: [{ id: 18, name: "Drama" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const db = fakeCacheDb();

    await new Tmdb("token", undefined, db).genres("movie");
    const again = await new Tmdb("token", undefined, db).genres("movie"); // a separate request

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(again.get(18)).toBe("Drama");
  });

  it("still answers when the cache table is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ genres: [{ id: 18, name: "Drama" }] })));
    const broken = { prepare: () => { throw new Error("no such table: tmdb_cache"); } } as unknown as D1Database;
    expect((await new Tmdb("token", undefined, broken).genres("movie")).get(18)).toBe("Drama");
  });

  it("retries after a failed genre request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500 }))
      .mockResolvedValueOnce(Response.json({ genres: [{ id: 18, name: "Drama" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const tmdb = new Tmdb("token");

    await expect(tmdb.genres("movie")).rejects.toThrow();
    expect((await tmdb.genres("movie")).get(18)).toBe("Drama");
  });
});

/** Just enough of D1 for tmdb_cache: one row per key, no expiry handling. */
function fakeCacheDb(): D1Database {
  const rows = new Map<string, string>();
  const prepare = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      first: async () => (rows.has(args[0] as string) ? { body: rows.get(args[0] as string) } : null),
      run: async () => {
        if (sql.startsWith("INSERT")) rows.set(args[0] as string, args[1] as string);
      },
    }),
    run: async () => {},
  });
  return {
    prepare,
    batch: async (stmts: { run: () => Promise<void> }[]) => {
      for (const s of stmts) await s.run();
    },
  } as unknown as D1Database;
}
