import type { TitleType } from "../shared/types";

const DEFAULT_BASE = "https://api.themoviedb.org/3";

export interface TmdbListItem {
  id: number;
  media_type?: string;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  vote_average?: number;
  vote_count?: number;
  popularity?: number;
}

export interface TmdbPage {
  page: number;
  total_pages: number;
  results: TmdbListItem[];
}

export interface TmdbProviders {
  results?: Record<string, { flatrate?: { provider_id: number }[]; ads?: { provider_id: number }[] }>;
}

export interface TmdbDetails extends TmdbListItem {
  genres?: { id: number; name: string }[];
  runtime?: number | null;
  episode_run_time?: number[];
  seasons?: { season_number: number; episode_count: number }[];
  created_by?: { id: number; name: string; profile_path: string | null }[];
  credits?: {
    cast?: { id: number; name: string; character?: string; profile_path: string | null; order?: number }[];
    crew?: { id: number; name: string; job?: string; profile_path: string | null }[];
  };
  keywords?: { keywords?: { name: string }[]; results?: { name: string }[] };
  "watch/providers"?: TmdbProviders;
}

/** Normalized title fields ready to store. */
export interface TitleInput {
  tmdbId: number;
  type: TitleType;
  name: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  genres: string[];
  voteAverage: number | null;
  voteCount: number | null;
  popularity: number | null;
}

export class Tmdb {
  private genreCache = new Map<TitleType, Map<number, string>>();

  constructor(
    private token: string,
    private base: string = DEFAULT_BASE,
  ) {}

  async get<T>(path: string, params: Record<string, string | number | undefined> = {}, cacheTtl = 60 * 60 * 6): Promise<T> {
    const url = new URL(this.base + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
      cf: { cacheTtl, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) {
      throw new TmdbError(res.status, `TMDB ${path} failed with ${res.status}`);
    }
    return (await res.json()) as T;
  }

  async genres(type: TitleType): Promise<Map<number, string>> {
    const cached = this.genreCache.get(type);
    if (cached) return cached;
    const data = await this.get<{ genres: { id: number; name: string }[] }>(`/genre/${type}/list`, {}, 60 * 60 * 24 * 7);
    const map = new Map(data.genres.map((g) => [g.id, g.name]));
    this.genreCache.set(type, map);
    return map;
  }

  async normalize(item: TmdbListItem, type: TitleType): Promise<TitleInput> {
    const genreMap = await this.genres(type);
    const date = type === "movie" ? item.release_date : item.first_air_date;
    const year = date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
    return {
      tmdbId: item.id,
      type,
      name: (type === "movie" ? item.title : item.name) ?? item.title ?? item.name ?? "Untitled",
      year,
      overview: item.overview || null,
      posterPath: item.poster_path ?? null,
      backdropPath: item.backdrop_path ?? null,
      genres: (item.genre_ids ?? []).map((id) => genreMap.get(id)).filter((g): g is string => !!g),
      voteAverage: item.vote_average ?? null,
      voteCount: item.vote_count ?? null,
      popularity: item.popularity ?? null,
    };
  }

  details(type: TitleType, tmdbId: number): Promise<TmdbDetails> {
    return this.get<TmdbDetails>(`/${type}/${tmdbId}`, {
      append_to_response: "credits,keywords,watch/providers",
    });
  }

  providers(type: TitleType, tmdbId: number): Promise<TmdbProviders> {
    return this.get<TmdbProviders>(`/${type}/${tmdbId}/watch/providers`, {}, 60 * 60 * 24);
  }
}

export class TmdbError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Provider ids that stream a title (subscription or free with ads) in a region. */
export function streamingProviderIds(data: TmdbProviders | undefined, region: string): number[] {
  const r = data?.results?.[region];
  if (!r) return [];
  return [...new Set([...(r.flatrate ?? []), ...(r.ads ?? [])].map((p) => p.provider_id))];
}
