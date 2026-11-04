// A tiny fake TMDB API for local development and tests without an API key.
// Usage: node scripts/mock-tmdb.mjs [port]   then set TMDB_API_BASE=http://localhost:<port>/3 in .dev.vars
import http from "node:http";

const port = Number(process.argv[2] ?? 4010);

const movieGenres = [
  [28, "Action"], [12, "Adventure"], [16, "Animation"], [35, "Comedy"], [80, "Crime"],
  [18, "Drama"], [14, "Fantasy"], [27, "Horror"], [9648, "Mystery"], [10749, "Romance"],
  [878, "Science Fiction"], [53, "Thriller"],
];
const tvGenres = [
  [10759, "Action & Adventure"], [16, "Animation"], [35, "Comedy"], [80, "Crime"], [18, "Drama"],
  [9648, "Mystery"], [10765, "Sci-Fi & Fantasy"],
];

const adjectives = ["Silent", "Last", "Hidden", "Northern", "Crimson", "Lost", "Electric", "Paper", "Midnight", "Golden", "Broken", "Quiet", "Wild", "Glass", "Iron"];
const nouns = ["Harbour", "Signal", "Orchard", "Frontier", "Kingdom", "Letters", "Engine", "Summer", "Garden", "Tide", "Circuit", "Lighthouse", "Parade", "Archive", "Comet"];
const providers = [8, 119, 337, 230, 73];

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function makePool(type, count, genres, offset) {
  const r = rng(offset + 7);
  return Array.from({ length: count }, (_, i) => {
    const id = offset + i + 1;
    const name = `${type === "tv" ? "The " : ""}${adjectives[Math.floor(r() * adjectives.length)]} ${nouns[Math.floor(r() * nouns.length)]}${i % 7 === 0 ? " II" : ""}`;
    const g = [genres[Math.floor(r() * genres.length)][0], genres[Math.floor(r() * genres.length)][0]];
    const year = 1985 + Math.floor(r() * 40);
    return {
      id,
      [type === "movie" ? "title" : "name"]: name,
      [type === "movie" ? "release_date" : "first_air_date"]: `${year}-0${1 + Math.floor(r() * 9)}-15`,
      overview: `A ${type === "tv" ? "series" : "film"} about ${name.toLowerCase()} and the people caught up in it. Mock data for local development.`,
      poster_path: `/mock-${type}-${id}.jpg`,
      backdrop_path: `/mock-backdrop-${type}-${id}.jpg`,
      genre_ids: [...new Set(g)],
      vote_average: Math.round((5 + r() * 4) * 10) / 10,
      vote_count: Math.floor(200 + r() * 20000),
      popularity: Math.round(r() * 1000),
      _providers: providers.filter(() => r() < 0.35),
      _seasons: type === "tv" ? Array.from({ length: 1 + Math.floor(r() * 4) }, (_, s) => ({ season_number: s + 1, episode_count: 6 + Math.floor(r() * 6) })) : undefined,
    };
  });
}

const pools = { movie: makePool("movie", 120, movieGenres, 1000), tv: makePool("tv", 60, tvGenres, 5000) };
const strip = ({ _providers, _seasons, ...rest }) => rest;
const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

http
  .createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const p = url.pathname.replace(/^\/3/, "");
    const q = url.searchParams;
    let m;
    if ((m = p.match(/^\/genre\/(movie|tv)\/list$/))) {
      return json(res, { genres: (m[1] === "movie" ? movieGenres : tvGenres).map(([id, name]) => ({ id, name })) });
    }
    if ((m = p.match(/^\/discover\/(movie|tv)$/))) {
      let list = [...pools[m[1]]];
      if (q.get("with_genres")) list = list.filter((t) => t.genre_ids.includes(Number(q.get("with_genres"))));
      if (q.get("with_watch_providers")) {
        const ids = q.get("with_watch_providers").split("|").map(Number);
        list = list.filter((t) => t._providers.some((x) => ids.includes(x)));
      }
      list.sort((a, b) => (q.get("sort_by")?.startsWith("vote") ? b.vote_average - a.vote_average : b.popularity - a.popularity));
      const page = Number(q.get("page") ?? 1);
      return json(res, { page, total_pages: Math.ceil(list.length / 20), results: list.slice((page - 1) * 20, page * 20).map(strip) });
    }
    if (p === "/search/multi") {
      const term = (q.get("query") ?? "").toLowerCase();
      const results = [
        ...pools.movie.filter((t) => t.title.toLowerCase().includes(term)).map((t) => ({ ...strip(t), media_type: "movie" })),
        ...pools.tv.filter((t) => t.name.toLowerCase().includes(term)).map((t) => ({ ...strip(t), media_type: "tv" })),
      ].slice(0, 20);
      return json(res, { page: 1, total_pages: 1, results });
    }
    if (p === "/watch/providers/movie") {
      return json(res, {
        results: [
          { provider_id: 8, provider_name: "Netflix", logo_path: "/mock-logo-netflix.jpg" },
          { provider_id: 119, provider_name: "Amazon Prime Video", logo_path: "/mock-logo-prime.jpg" },
          { provider_id: 337, provider_name: "Disney Plus", logo_path: "/mock-logo-disney.jpg" },
        ],
      });
    }
    if ((m = p.match(/^\/(movie|tv)\/(\d+)(\/watch\/providers)?$/))) {
      const t = pools[m[1]].find((x) => x.id === Number(m[2]));
      if (!t) return json(res, { status_message: "Not found" }, 404);
      const watch = { results: { CA: { flatrate: t._providers.map((provider_id) => ({ provider_id })) } } };
      if (m[3]) return json(res, watch);
      const genres = (m[1] === "movie" ? movieGenres : tvGenres).filter(([id]) => t.genre_ids.includes(id)).map(([id, name]) => ({ id, name }));
      return json(res, {
        ...strip(t),
        genres,
        runtime: m[1] === "movie" ? 95 + (t.id % 60) : undefined,
        episode_run_time: m[1] === "tv" ? [45] : undefined,
        seasons: t._seasons,
        created_by: m[1] === "tv" ? [{ id: 90000 + t.id, name: "Sam Rivera", profile_path: null }] : undefined,
        credits: {
          cast: ["Alex Moreau", "Priya Nair", "Jonah Okafor", "Mei Tanaka", "Ruth Calder"].map((name, i) => ({ id: 80000 + i, name, character: `Role ${i + 1}`, profile_path: null, order: i })),
          crew: m[1] === "movie" ? [{ id: 70000 + (t.id % 9), name: ["Lena Park", "Oscar Hale", "Ines Duarte"][t.id % 3], job: "Director", profile_path: null }] : [],
        },
        keywords: { keywords: [{ name: "friendship" }, { name: "small town" }] },
        "watch/providers": watch,
      });
    }
    json(res, { status_message: `Mock has no route for ${p}` }, 404);
  })
  .listen(port, () => console.log(`Mock TMDB on http://localhost:${port}/3`));
