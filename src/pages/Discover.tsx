import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DeckCard, SwipeChoice, Thumb } from "../../shared/types";
import { api, img, type DeckFilters } from "../api";
import { useApp } from "../App";
import { navigate } from "../router";
import { Chip, ErrorNote, Meta, TypeBadge, WantedBy } from "../components/bits";
import { Icon } from "../components/Icon";

const FILTER_KEY = "watchlist.deckFilters";
const SWIPE_DISTANCE = 100;

function loadFilters(): DeckFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { media: "all", genre: "", services: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { media: "all", genre: "", services: false };
}

interface Done {
  card: DeckCard;
  choice: SwipeChoice;
}

export function Discover() {
  const { partner } = useApp();
  const [filters, setFilters] = useState<DeckFilters>(loadFilters);
  const [cards, setCards] = useState<DeckCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Done[]>([]);
  const [askThumb, setAskThumb] = useState<DeckCard | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [genres, setGenres] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const loadingRef = useRef(false);
  const cardsRef = useRef<DeckCard[]>([]);
  cardsRef.current = cards;

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* ignore */
    }
  }, [filters]);

  useEffect(() => {
    api.genres().then((g) => setGenres(g.genres), () => {});
  }, []);

  const loadMore = useCallback(
    async (reset = false) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const current = reset ? [] : cardsRef.current;
        const res = await api.deck(filters, current.map((c) => c.id));
        const have = new Set(current.map((c) => c.id));
        setCards([...current, ...res.cards.filter((c) => !have.has(c.id))]);
        setExhausted(res.exhausted);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [filters],
  );

  // Reload when filters change.
  useEffect(() => {
    setCards([]);
    setExhausted(false);
    void loadMore(true);
  }, [loadMore]);

  // Top up the deck before it runs out.
  useEffect(() => {
    if (cards.length < 5 && !exhausted && !loadingRef.current && !error) void loadMore();
  }, [cards.length, exhausted, loadMore, error]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2500);
  };

  const commit = async (card: DeckCard, choice: SwipeChoice, thumb?: Thumb | null) => {
    setCards((cs) => cs.filter((c) => c.id !== card.id));
    setHistory((h) => [...h.slice(-19), { card, choice }]);
    try {
      const res = await api.swipe(card.id, choice, { thumb });
      if (res.match) showToast(`It's a match! ${card.name} is at the top of your watchlist.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const decide = (card: DeckCard, choice: SwipeChoice) => {
    if (choice === "seen") {
      setCards((cs) => cs.filter((c) => c.id !== card.id));
      setAskThumb(card);
      return;
    }
    void commit(card, choice);
  };

  const answerThumb = (thumb: Thumb | null) => {
    const card = askThumb;
    setAskThumb(null);
    if (!card) return;
    // commit() removes the card again (no-op) and records history
    void commit(card, "seen", thumb);
  };

  const undo = async () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setCards((cs) => [last.card, ...cs.filter((c) => c.id !== last.card.id)]);
    try {
      await api.undoSwipe(last.card.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const top = cards[0];
  const activeFilterCount = (filters.media !== "all" ? 1 : 0) + (filters.genre ? 1 : 0) + (filters.services ? 1 : 0);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 pt-4 pb-2">
        <h1 className="text-2xl font-bold">Discover</h1>
        <button onClick={() => setShowFilters((s) => !s)} className="rounded-full border border-line px-3 py-1 text-sm text-muted">
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
        </button>
      </header>

      {showFilters && (
        <div className="space-y-2 px-4 pb-2">
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {(["all", "movie", "tv"] as const).map((m) => (
              <Chip key={m} active={filters.media === m} onClick={() => setFilters((f) => ({ ...f, media: m }))}>
                {m === "all" ? "Movies & shows" : m === "movie" ? "Movies" : "Shows"}
              </Chip>
            ))}
            <Chip active={filters.services} onClick={() => setFilters((f) => ({ ...f, services: !f.services }))}>
              On our services
            </Chip>
          </div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            <Chip active={!filters.genre} onClick={() => setFilters((f) => ({ ...f, genre: "" }))}>
              Any genre
            </Chip>
            {genres.map((g) => (
              <Chip key={g} active={filters.genre === g} onClick={() => setFilters((f) => ({ ...f, genre: g }))}>
                {g}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {error && <ErrorNote error={error} onRetry={() => void loadMore()} />}

      <div className="relative mx-4 min-h-0 flex-1">
        {cards
          .slice(0, 3)
          .reverse()
          .map((card) => (
            <SwipeCard key={card.id} card={card} isTop={card.id === top?.id} onDecide={(choice) => decide(card, choice)} />
          ))}
        {!top && (
          <div className="flex h-full items-center justify-center text-center text-muted">
            {loading ? "Finding something good…" : exhausted ? "You've seen everything that matches these filters." : "No cards right now."}
          </div>
        )}
      </div>

      <div className="flex items-center justify-center gap-5 py-4">
        <RoundButton label="Undo" onClick={() => void undo()} disabled={history.length === 0} small>
          <Icon name="undo" />
        </RoundButton>
        <RoundButton label="Pass" onClick={() => top && decide(top, "pass")} disabled={!top} color="text-pass">
          <Icon name="x" className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Seen it" onClick={() => top && decide(top, "seen")} disabled={!top} color="text-seen">
          <Icon name="eye" className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Want" onClick={() => top && decide(top, "want")} disabled={!top} color="text-want">
          <Icon name="heart" className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Details" onClick={() => top && navigate({ name: "title", id: top.id })} disabled={!top} small>
          <Icon name="info" />
        </RoundButton>
      </div>

      {askThumb && (
        <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/60" onClick={() => answerThumb(null)}>
          <div className="pb-safe w-full max-w-lg rounded-t-2xl bg-surface p-6" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm text-muted">You've seen</p>
            <p className="mb-5 text-lg font-semibold">{askThumb.name}</p>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => answerThumb(1)} className="flex flex-col items-center gap-2 rounded-xl bg-want/15 py-4 text-want">
                <Icon name="up" className="h-7 w-7" />
                Liked it
              </button>
              <button onClick={() => answerThumb(-1)} className="flex flex-col items-center gap-2 rounded-xl bg-pass/15 py-4 text-pass">
                <Icon name="down" className="h-7 w-7" />
                Didn't
              </button>
              <button onClick={() => answerThumb(null)} className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 py-4 text-muted">
                <Icon name="x" className="h-7 w-7" />
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed inset-x-4 top-6 z-30 mx-auto max-w-md rounded-xl bg-want px-4 py-3 text-center font-medium text-black shadow-lg">{toast}</div>
      )}

      {partner === null && (
        <p className="px-6 pb-2 text-center text-xs text-muted">Matches start once your partner signs in and swipes too.</p>
      )}
    </div>
  );
}

function RoundButton({
  label,
  onClick,
  disabled,
  color = "text-muted",
  small,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center justify-center rounded-full border border-line bg-surface shadow-md transition active:scale-90 disabled:opacity-30 ${color} ${
        small ? "h-11 w-11" : "h-16 w-16"
      }`}
    >
      {children}
    </button>
  );
}

function SwipeCard({ card, isTop, onDecide }: { card: DeckCard; isTop: boolean; onDecide: (choice: SwipeChoice) => void }) {
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [leaving, setLeaving] = useState<SwipeChoice | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (!isTop) return;
    start.current = { x: e.clientX, y: e.clientY };
    moved.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!start.current) return;
    const x = e.clientX - start.current.x;
    const y = e.clientY - start.current.y;
    if (Math.abs(x) > 5 || Math.abs(y) > 5) moved.current = true;
    setDrag({ x, y, active: true });
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    const { x, y } = drag;
    let choice: SwipeChoice | null = null;
    if (x > SWIPE_DISTANCE) choice = "want";
    else if (x < -SWIPE_DISTANCE) choice = "pass";
    else if (y < -SWIPE_DISTANCE) choice = "seen";
    if (choice) {
      setLeaving(choice);
      window.setTimeout(() => onDecide(choice), 180);
    } else {
      setDrag({ x: 0, y: 0, active: false });
      if (!moved.current) navigate({ name: "title", id: card.id });
    }
  };

  const fly = leaving === "want" ? { x: 600, y: drag.y } : leaving === "pass" ? { x: -600, y: drag.y } : leaving === "seen" ? { x: drag.x, y: -900 } : null;
  const x = fly?.x ?? drag.x;
  const y = fly?.y ?? drag.y;
  const transform = isTop ? `translate(${x}px, ${y}px) rotate(${x / 18}deg)` : "scale(0.95) translateY(12px)";
  const hint: SwipeChoice | null = drag.x > 40 ? "want" : drag.x < -40 ? "pass" : drag.y < -40 ? "seen" : null;
  const poster = img(card.posterPath, "w500");

  return (
    <div
      className="absolute inset-0 touch-none select-none overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
      style={{ transform, transition: drag.active && !leaving ? "none" : "transform 0.2s ease-out" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {poster ? (
        <img src={poster} alt="" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-6 text-center text-2xl font-bold text-muted">{card.name}</div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/80 to-transparent p-4 pt-24">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <TypeBadge type={card.type} />
          <WantedBy memberIds={card.wantedBy} />
        </div>
        <h2 className="text-2xl leading-tight font-bold">{card.name}</h2>
        <Meta title={card} />
        {card.genres.length > 0 && <p className="mt-1 text-sm text-muted">{card.genres.slice(0, 3).join(", ")}</p>}
        {card.overview && <p className="mt-2 line-clamp-3 text-sm text-white/80">{card.overview}</p>}
      </div>
      {isTop && hint && (
        <div
          className={`absolute top-6 rounded-lg border-4 px-3 py-1 text-2xl font-black uppercase ${
            hint === "want" ? "left-6 -rotate-12 border-want text-want" : hint === "pass" ? "right-6 rotate-12 border-pass text-pass" : "left-1/2 -translate-x-1/2 border-seen text-seen"
          }`}
        >
          {hint === "want" ? "Want" : hint === "pass" ? "Pass" : "Seen it"}
        </div>
      )}
    </div>
  );
}
