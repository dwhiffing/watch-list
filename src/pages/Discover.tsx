import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { DeckCard, SwipeChoice, Thumb, TitleDetail } from "../../shared/types";
import { api, img, type DeckFilters } from "../api";
import { useApp } from "../App";
import { useRoute } from "../router";
import { Chip, ErrorNote, Meta, Poster, TypeBadge, WantedBy } from "../components/bits";
import { Icon } from "../components/Icon";
import { ServicesNote, TitleAbout } from "../components/TitleInfo";

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
  const route = useRoute();
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
  const [info, setInfo] = useState<DeckCard | null>(null);
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

  // Keyboard shortcuts for desktop. Discover stays mounted on other pages, so only listen while it's showing.
  const keys = useRef({ top, askThumb, info, decide, undo, answerThumb });
  keys.current = { top, askThumb, info, decide, undo, answerThumb };
  useEffect(() => {
    if (route.name !== "discover") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest("input, textarea, select")) return;
      const k = keys.current;
      const action = k.info
        ? { Escape: () => setInfo(null), Enter: () => setInfo(null) }[e.key]
        : k.askThumb
          ? { ArrowUp: () => k.answerThumb(1), ArrowDown: () => k.answerThumb(-1), Escape: () => k.answerThumb(null) }[e.key]
          : {
              ArrowLeft: () => k.top && k.decide(k.top, "pass"),
              ArrowRight: () => k.top && k.decide(k.top, "want"),
              ArrowUp: () => k.top && k.decide(k.top, "seen"),
              z: () => void k.undo(),
              Enter: () => k.top && setInfo(k.top),
            }[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [route.name]);
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

      {/* On desktop the card keeps a poster's 2:3 shape instead of stretching to the window */}
      <div className="relative mx-4 min-h-0 flex-1 md:mx-auto md:aspect-2/3 md:max-w-full">
        {cards
          .slice(0, 3)
          .reverse()
          .map((card) => (
            <SwipeCard key={card.id} card={card} isTop={card.id === top?.id} onDecide={(choice) => decide(card, choice)} onOpen={() => setInfo(card)} />
          ))}
        {!top && (
          <div className="flex h-full items-center justify-center text-center text-muted">
            {loading ? "Finding something good…" : exhausted ? "You've seen everything that matches these filters." : "No cards right now."}
          </div>
        )}
      </div>

      <div className="flex items-start justify-center gap-2 py-4 md:gap-4">
        <RoundButton label="Undo" shortcut="Z" onClick={() => void undo()} disabled={history.length === 0} small>
          <Icon name="undo" />
        </RoundButton>
        <RoundButton label="Pass" shortcut="←" onClick={() => top && decide(top, "pass")} disabled={!top} color="text-pass">
          <Icon name="down" className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Seen" shortcut="↑" onClick={() => top && decide(top, "seen")} disabled={!top} color="text-seen">
          <Icon name="eye" className="h-7 w-7" />
        </RoundButton>
        <RoundButton label="Add" shortcut="→" onClick={() => top && decide(top, "want")} disabled={!top} color="text-want">
          <Icon name="up" className="h-7 w-7" />
        </RoundButton>
        <RoundButton
          label="Info"
          shortcut="Enter"
          onClick={() => top && setInfo(top)}
          onPrefetch={() => top && void loadDetail(top.id).catch(() => {})}
          disabled={!top}
          small
        >
          <Icon name="info" />
        </RoundButton>
      </div>
      <p className="hidden pb-4 text-center text-xs text-muted md:block">← Pass · ↑ Seen · → Add · Z undo · Enter info</p>

      {askThumb && (
        <div className="fixed inset-0 z-20 flex animate-fade-in items-end justify-center bg-black/60 md:items-center md:p-6" onClick={() => answerThumb(null)}>
          <div
            className="w-full max-w-lg animate-sheet-up rounded-t-2xl bg-surface p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] motion-reduce:animate-none md:max-w-md md:animate-pop-in md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="mb-1 text-sm text-muted">You've seen</p>
            <p className="mb-5 text-lg font-semibold">{askThumb.name}</p>
            <div className="grid grid-cols-3 gap-3">
              <button onClick={() => answerThumb(1)} className="flex flex-col items-center gap-2 rounded-xl bg-want/15 py-4 text-want">
                <Icon name="up" className="h-7 w-7" />
                Like
              </button>
              <button onClick={() => answerThumb(-1)} className="flex flex-col items-center gap-2 rounded-xl bg-pass/15 py-4 text-pass">
                <Icon name="down" className="h-7 w-7" />
                Dislike
              </button>
              <button onClick={() => answerThumb(null)} className="flex flex-col items-center gap-2 rounded-xl bg-surface-2 py-4 text-muted">
                <Icon name="x" className="h-7 w-7" />
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {info && <InfoSheet card={info} onClose={() => setInfo(null)} />}

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
  shortcut,
  onClick,
  onPrefetch,
  disabled,
  color = "text-muted",
  small,
  children,
}: {
  label: string;
  shortcut?: string;
  onClick: () => void;
  /** Called on hover or press, before the click lands */
  onPrefetch?: () => void;
  disabled?: boolean;
  color?: string;
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    // Every button sits in a same-height slot so the captions line up whatever the button size.
    <button
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      onPointerEnter={onPrefetch}
      onPointerDown={onPrefetch}
      disabled={disabled}
      className={`group flex w-16 flex-col items-center gap-1.5 disabled:opacity-30 ${color}`}
    >
      <span className="flex h-16 items-center">
        <span
          className={`flex items-center justify-center rounded-full border border-line bg-surface shadow-md transition group-active:scale-90 ${
            small ? "h-11 w-11" : "h-16 w-16"
          }`}
        >
          {children}
        </span>
      </span>
      <span className="text-center text-[11px] leading-tight text-muted">{label}</span>
    </button>
  );
}

/** Just the facts about a card (no actions or ratings), so you can decide without leaving the deck. */
// Title details already fetched this session, so reopening (or opening after a hover prefetch) is instant.
const detailCache = new Map<number, Promise<TitleDetail>>();
function loadDetail(id: number): Promise<TitleDetail> {
  let p = detailCache.get(id);
  if (!p) {
    p = api.title(id);
    p.catch(() => detailCache.delete(id)); // let a later open retry
    detailCache.set(id, p);
  }
  return p;
}

function InfoSheet({ card, onClose }: { card: DeckCard; onClose: () => void }) {
  const [detail, setDetail] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    loadDetail(card.id).then(
      (t) => live && setDetail(t),
      (err: Error) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, [card.id]);

  // Show what the card already knows straight away; details fill in when they load.
  const t = detail ?? card;
  const backdrop = img(card.backdropPath, "w780");

  return (
    <div className="fixed inset-0 z-20 flex animate-fade-in items-end justify-center bg-black/60 md:items-center md:p-6" onClick={onClose}>
      <div
        className="relative max-h-[90dvh] w-full max-w-lg animate-sheet-up overflow-y-auto overscroll-contain rounded-t-2xl bg-surface pb-[calc(1.5rem+env(safe-area-inset-bottom))] motion-reduce:animate-none md:max-w-2xl md:animate-pop-in md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 -mb-16 flex justify-end p-3">
          <button onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60">
            <Icon name="x" />
          </button>
        </div>
        {backdrop ? (
          <div className="h-40 bg-surface-2 md:h-56">
            <img
              src={backdrop}
              alt=""
              onLoad={() => setBackdropLoaded(true)}
              className={`h-full w-full object-cover transition-opacity duration-300 ${backdropLoaded ? "opacity-60" : "opacity-0"}`}
            />
          </div>
        ) : (
          <div className="h-20" />
        )}

        <div className="-mt-12 flex gap-4 px-4">
          {/* Same image size as the card, so it's already in the browser cache */}
          <Poster title={t} size="w500" className="relative h-36 w-24 shrink-0 rounded-lg shadow-xl md:h-48 md:w-32" />
          <div className="min-w-0 self-end">
            <h2 className="text-xl leading-tight font-bold md:text-2xl">{t.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <TypeBadge type={t.type} />
              <Meta title={t} />
            </div>
            {t.genres.length > 0 && <p className="mt-1 text-sm text-muted">{t.genres.join(", ")}</p>}
          </div>
        </div>

        {error && <ErrorNote error={error} />}
        {detail ? (
          <>
            <div className="mt-4 px-4">
              <ServicesNote serviceIds={detail.services} />
            </div>
            <TitleAbout title={detail} />
          </>
        ) : (
          !error && <DetailSkeleton />
        )}
      </div>
    </div>
  );
}

/** Roughly the shape of the services line, overview and cast, so the sheet doesn't jump when they arrive. */
function DetailSkeleton() {
  return (
    <div className="animate-pulse" aria-label="Loading">
      <div className="mt-4 h-6 w-40 rounded bg-surface-2 mx-4" />
      <div className="mt-6 space-y-2 px-4">
        <div className="h-4 rounded bg-surface-2" />
        <div className="h-4 rounded bg-surface-2" />
        <div className="h-4 w-2/3 rounded bg-surface-2" />
      </div>
      <div className="mt-4 h-4 w-48 rounded bg-surface-2 mx-4" />
      <div className="mt-8 h-4 w-12 rounded bg-surface-2 mx-4" />
      <div className="mt-3 flex gap-3 overflow-hidden px-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 w-20 shrink-0 rounded-full bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

function SwipeCard({
  card,
  isTop,
  onDecide,
  onOpen,
}: {
  card: DeckCard;
  isTop: boolean;
  onDecide: (choice: SwipeChoice) => void;
  onOpen: () => void;
}) {
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
      if (!moved.current) onOpen();
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
