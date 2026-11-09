export type TitleType = "movie" | "tv";
export type SwipeChoice = "want" | "pass" | "seen";
export type Thumb = 1 | -1;

export interface Member {
  id: number;
  name: string;
}

export interface TitleSummary {
  id: number;
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
  runtime: number | null;
}

export interface DeckCard extends TitleSummary {
  /** Members (other than you) who already swiped Want on this. */
  wantedBy: number[];
}

export interface WatchlistItem extends TitleSummary {
  wantedBy: number[];
  /** Enabled streaming service ids that carry this title. */
  services: number[];
  /** TV only: the latest episode watched. */
  progress: { season: number; episode: number } | null;
  addedAt: string;
}

export interface StreamingService {
  id: number;
  name: string;
  providerIds: number[];
  logoPath: string | null;
  enabled: boolean;
}

export interface CastMember {
  name: string;
  character: string | null;
  profilePath: string | null;
}

export interface WatchEvent {
  id: number;
  memberIds: number[];
  watchedOn: string | null;
  season: number | null;
  episode: number | null;
  isRewatch: boolean;
}

export interface TitleDetail extends TitleSummary {
  keywords: string[];
  cast: CastMember[];
  directors: string[];
  seasons: { season: number; episodes: number }[] | null;
  services: number[];
  swipes: Record<number, SwipeChoice>;
  ratings: Record<number, Thumb>;
  events: WatchEvent[];
  progress: { season: number; episode: number } | null;
  finished: boolean;
}

export interface SearchResult extends TitleSummary {
  mySwipe: SwipeChoice | null;
  onWatchlist: boolean;
}

export interface HistoryEntry {
  event: WatchEvent;
  title: TitleSummary;
  ratings: Record<number, Thumb>;
}

export interface MeResponse {
  me: Member;
  members: Member[];
  region: string;
}

export interface SessionInfo {
  /** False until the APP_PASSWORD secret is set. */
  configured: boolean;
  /** People who have signed in before, so you can pick your name. */
  members: Member[];
}
