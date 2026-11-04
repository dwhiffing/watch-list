import type {
  DeckCard,
  HistoryEntry,
  MeResponse,
  SearchResult,
  StreamingService,
  SwipeChoice,
  Thumb,
  TitleDetail,
  WatchlistItem,
} from "../shared/types";

const DEV_EMAIL_KEY = "watchlist.devEmail";

export function getDevEmail(): string | null {
  try {
    return localStorage.getItem(DEV_EMAIL_KEY);
  } catch {
    return null;
  }
}

export function setDevEmail(email: string) {
  try {
    localStorage.setItem(DEV_EMAIL_KEY, email);
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const dev = getDevEmail();
  if (dev) headers["x-dev-email"] = dev;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      /* not json */
    }
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as T;
}

export interface DeckFilters {
  media: "all" | "movie" | "tv";
  genre: string;
  services: boolean;
}

export const api = {
  me: () => request<MeResponse>("GET", "/me"),
  rename: (name: string) => request("PATCH", "/me", { name }),
  genres: () => request<{ genres: string[] }>("GET", "/genres"),
  deck: (f: DeckFilters, exclude: number[]) =>
    request<{ cards: DeckCard[]; exhausted: boolean }>(
      "GET",
      `/deck?${new URLSearchParams({
        media: f.media,
        genre: f.genre,
        services: f.services ? "1" : "0",
        exclude: exclude.join(","),
      })}`,
    ),
  swipe: (titleId: number, choice: SwipeChoice, opts: { thumb?: Thumb | null; source?: "deck" | "manual" } = {}) =>
    request<{ ok: true; match: boolean }>("POST", "/swipes", { titleId, choice, ...opts }),
  undoSwipe: (titleId: number) => request("DELETE", `/swipes/${titleId}`),
  watchlist: () => request<{ items: WatchlistItem[]; watching: WatchlistItem[] }>("GET", "/watchlist"),
  removeFromWatchlist: (titleId: number) => request("DELETE", `/titles/${titleId}/watchlist`),
  search: (q: string) => request<{ results: SearchResult[] }>("GET", `/search?q=${encodeURIComponent(q)}`),
  title: (id: number) => request<TitleDetail>("GET", `/titles/${id}`),
  rate: (id: number, thumb: Thumb | null) => request("PUT", `/titles/${id}/rating`, { thumb }),
  watched: (
    id: number,
    body: { memberIds: number[]; watchedOn?: string | null; season?: number; episode?: number; isRewatch?: boolean },
  ) => request("POST", `/titles/${id}/watched`, body),
  deleteEvent: (eventId: number) => request("DELETE", `/watch-events/${eventId}`),
  history: () => request<{ entries: HistoryEntry[] }>("GET", "/history"),
  services: () => request<{ services: StreamingService[] }>("GET", "/services"),
  setService: (id: number, enabled: boolean) => request("PATCH", `/services/${id}`, { enabled }),
};

export function img(path: string | null | undefined, size: "w92" | "w185" | "w342" | "w500" | "w780" | "original" = "w342") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
