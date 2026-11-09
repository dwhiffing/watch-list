import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../../shared/types";
import { api } from "../api";
import { href } from "../router";
import { Empty, ErrorNote, Meta, PageHeader, Poster, TypeBadge } from "../components/bits";
import { Icon } from "../components/Icon";

export function Search() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const id = ++latest.current;
    const t = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.search(query);
        if (id === latest.current) {
          setResults(res.results);
          setError(null);
        }
      } catch (err) {
        if (id === latest.current) setError((err as Error).message);
      } finally {
        if (id === latest.current) setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const want = async (r: SearchResult) => {
    setResults((rs) => rs.map((x) => (x.id === r.id ? { ...x, mySwipe: "want", onWatchlist: true } : x)));
    try {
      await api.swipe(r.id, "want", { source: "manual" });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="pb-6">
      <PageHeader title="Search" />
      <div className="px-4 pb-3 md:max-w-xl">
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Movie or show name"
          className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-base outline-none focus:border-accent"
        />
      </div>
      {error && <ErrorNote error={error} />}
      {loading && results.length === 0 && <Empty>Searching…</Empty>}
      {!loading && q.trim().length >= 2 && results.length === 0 && !error && <Empty>No matches.</Empty>}
      <ul className="md:grid md:grid-cols-2 md:gap-x-4">
        {results.map((r) => (
          <li key={r.id} className="flex items-center gap-3 border-b border-line/60 px-4 py-3">
            <a href={href({ name: "title", id: r.id })} className="flex min-w-0 flex-1 items-center gap-3">
              <Poster title={r} className="h-24 w-16 shrink-0 rounded-md" />
              <div className="min-w-0">
                <div className="truncate font-semibold">{r.name}</div>
                <div className="flex items-center gap-2">
                  <TypeBadge type={r.type} />
                  <Meta title={r} />
                </div>
                {r.mySwipe === "seen" && <div className="mt-1 text-xs text-seen">You've seen this</div>}
              </div>
            </a>
            {r.onWatchlist ? (
              <span className="shrink-0 text-xs text-want">On watchlist</span>
            ) : (
              <button
                onClick={() => void want(r)}
                aria-label={`Add ${r.name} to watchlist`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-want"
              >
                <Icon name="plus" />
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
