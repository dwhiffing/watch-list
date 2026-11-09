import { useCallback, useEffect, useState } from "react";
import type { Thumb, TitleDetail } from "../../shared/types";
import { nextEpisode } from "../../shared/ranking";
import { api, img } from "../api";
import { useApp } from "../App";
import { ErrorNote, Meta, Poster, ThumbIcon, TypeBadge, WantedBy } from "../components/bits";
import { Icon } from "../components/Icon";
import { ServicesNote, TitleAbout } from "../components/TitleInfo";
import { formatDate } from "./Watched";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

export function TitlePage({ id }: { id: number }) {
  const { me, members, nameOf } = useApp();
  const [t, setT] = useState<TitleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setT(await api.title(id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (error && !t) return <ErrorNote error={error} onRetry={() => void load()} />;
  if (!t) return <div className="p-8 text-center text-muted">Loading…</div>;

  const myThumb = t.ratings[me.id] ?? null;
  const iWant = t.swipes[me.id] === "want";
  const wantedBy = Object.entries(t.swipes)
    .filter(([, c]) => c === "want")
    .map(([m]) => Number(m));
  const backdrop = img(t.backdropPath, "w780");
  const next = t.type === "tv" && t.seasons && !t.finished ? nextEpisode(t.seasons, t.progress) : null;

  const setThumb = (thumb: Thumb) => act(() => api.rate(t.id, myThumb === thumb ? null : thumb));
  const toggleWant = () => act(() => (iWant ? api.undoSwipe(t.id) : api.swipe(t.id, "want", { source: "manual" })));

  return (
    <div className="pb-10">
      <div className="relative">
        {backdrop ? <img src={backdrop} alt="" className="h-52 w-full object-cover opacity-60 md:mt-4 md:h-80 md:rounded-2xl" /> : <div className="h-24" />}
        <button
          onClick={() => (history.length > 1 ? history.back() : (window.location.hash = "#/discover"))}
          className="absolute top-3 left-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 md:top-7 md:left-4"
          aria-label="Back"
        >
          <Icon name="back" />
        </button>
      </div>

      <div className="-mt-16 flex gap-4 px-4 md:-mt-24 md:gap-6 md:px-6">
        <Poster title={t} size="w342" className="relative h-44 w-30 shrink-0 rounded-lg shadow-xl md:h-64 md:w-44" />
        <div className="min-w-0 self-end">
          <h1 className="text-2xl leading-tight font-bold md:text-4xl">{t.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <TypeBadge type={t.type} />
            <Meta title={t} />
          </div>
          {t.genres.length > 0 && <p className="mt-1 text-sm text-muted">{t.genres.join(", ")}</p>}
        </div>
      </div>

      {error && <ErrorNote error={error} />}

      <div className="mt-4 flex flex-wrap items-center gap-2 px-4">
        <WantedBy memberIds={wantedBy} />
        <ServicesNote serviceIds={t.services} />
      </div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-2 px-4 md:max-w-md">
        <button
          onClick={() => void toggleWant()}
          className={`flex items-center justify-center gap-2 rounded-xl py-3 font-medium ${iWant ? "bg-want/20 text-want" : "bg-surface-2"}`}
        >
          <Icon name="heart" />
          {iWant ? "On your list" : "Want to watch"}
        </button>
        <button onClick={() => setLogOpen(true)} className="flex items-center justify-center gap-2 rounded-xl bg-surface-2 py-3 font-medium">
          <Icon name="check" />
          {t.type === "tv" ? "Log episodes" : "Mark watched"}
        </button>
      </div>

      {next && (
        <div className="mx-4 mt-3 flex items-center justify-between rounded-xl border border-seen/40 bg-seen/10 px-4 py-3 md:max-w-md">
          <div className="text-sm">
            <div className="text-muted">{t.progress ? `Watched up to S${t.progress.season} E${t.progress.episode}` : "Not started"}</div>
            <div className="font-medium">
              Next: S{next.season} E{next.episode}
            </div>
          </div>
          <button
            onClick={() => void act(() => api.watched(t.id, { memberIds: members.map((m) => m.id), season: next.season, episode: next.episode }))}
            className="rounded-full bg-seen px-4 py-2 text-sm font-semibold text-black"
          >
            Watched it
          </button>
        </div>
      )}

      {/* Ratings */}
      <section className="mt-6 px-4">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Ratings</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm">You</span>
          <button
            onClick={() => void setThumb(1)}
            aria-label="Thumbs up"
            className={`flex h-11 w-11 items-center justify-center rounded-full border ${myThumb === 1 ? "border-want bg-want/20 text-want" : "border-line text-muted"}`}
          >
            <Icon name="up" />
          </button>
          <button
            onClick={() => void setThumb(-1)}
            aria-label="Thumbs down"
            className={`flex h-11 w-11 items-center justify-center rounded-full border ${myThumb === -1 ? "border-pass bg-pass/20 text-pass" : "border-line text-muted"}`}
          >
            <Icon name="down" />
          </button>
          {members
            .filter((m) => m.id !== me.id)
            .map((m) => (
              <span key={m.id} className="ml-3 flex items-center gap-1 text-sm text-muted">
                {m.name}: {t.ratings[m.id] ? <ThumbIcon thumb={t.ratings[m.id]} /> : "not rated"}
              </span>
            ))}
        </div>
      </section>

      <TitleAbout title={t} />

      {/* Watch history for this title */}
      {t.events.length > 0 && (
        <section className="mt-6 px-4">
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">History</h2>
          <ul className="max-w-xl space-y-1 text-sm">
            {t.events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2">
                <span>
                  {e.season != null ? `S${e.season} E${e.episode}` : t.type === "tv" ? "Finished the show" : e.isRewatch ? "Rewatched" : "Watched"}
                  <span className="text-muted">
                    {" "}
                    · {e.watchedOn ? formatDate(e.watchedOn) : "date unknown"} ·{" "}
                    {members.length > 1 && members.every((m) => e.memberIds.includes(m.id)) ? "together" : e.memberIds.map(nameOf).join(", ")}
                  </span>
                </span>
                <button className="text-xs text-muted underline" onClick={() => void act(() => api.deleteEvent(e.id))}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {logOpen && (
        <LogSheet
          title={t}
          onClose={() => setLogOpen(false)}
          onSave={async (body) => {
            setLogOpen(false);
            await act(() => api.watched(t.id, body));
          }}
        />
      )}
    </div>
  );
}

function LogSheet({
  title,
  onClose,
  onSave,
}: {
  title: TitleDetail;
  onClose: () => void;
  onSave: (body: { memberIds: number[]; watchedOn: string | null; season?: number; episode?: number; isRewatch?: boolean }) => Promise<void>;
}) {
  const { members } = useApp();
  const [who, setWho] = useState<number[]>(members.map((m) => m.id));
  const [date, setDate] = useState(today());
  const [unknownDate, setUnknownDate] = useState(false);
  const [rewatch, setRewatch] = useState(title.events.some((e) => e.season == null));
  const isTv = title.type === "tv";
  const seasons = title.seasons ?? [];
  const start = nextEpisode(seasons, title.progress) ?? { season: seasons[0]?.season ?? 1, episode: 1 };
  const [mode, setMode] = useState<"episode" | "finished">("episode");
  const [season, setSeason] = useState(start.season);
  const [episode, setEpisode] = useState(start.episode);
  const episodeCount = seasons.find((s) => s.season === season)?.episodes ?? 1;

  const toggleWho = (id: number) => setWho((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));

  return (
    <div className="fixed inset-0 z-20 flex animate-fade-in items-end justify-center bg-black/60 md:items-center md:p-6" onClick={onClose}>
      <div
        className="w-full max-w-lg animate-sheet-up space-y-4 rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] motion-reduce:animate-none md:animate-pop-in md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Log {title.name}</h2>

        <div>
          <div className="mb-1 text-sm text-muted">Who watched</div>
          <div className="flex gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                onClick={() => toggleWho(m.id)}
                className={`rounded-full border px-3 py-1 text-sm ${who.includes(m.id) ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {isTv && (
          <div>
            <div className="mb-1 flex gap-2">
              <button onClick={() => setMode("episode")} className={`rounded-full px-3 py-1 text-sm ${mode === "episode" ? "bg-surface-2" : "text-muted"}`}>
                Watched up to an episode
              </button>
              <button onClick={() => setMode("finished")} className={`rounded-full px-3 py-1 text-sm ${mode === "finished" ? "bg-surface-2" : "text-muted"}`}>
                Finished the show
              </button>
            </div>
            {mode === "episode" && (
              <div className="flex gap-2">
                <select
                  value={season}
                  onChange={(e) => {
                    setSeason(Number(e.target.value));
                    setEpisode(1);
                  }}
                  className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2"
                >
                  {seasons.map((s) => (
                    <option key={s.season} value={s.season}>
                      Season {s.season}
                    </option>
                  ))}
                </select>
                <select value={episode} onChange={(e) => setEpisode(Number(e.target.value))} className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2">
                  {Array.from({ length: episodeCount }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      Episode {n}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <input
            type="date"
            value={date}
            disabled={unknownDate}
            max={today()}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 disabled:opacity-40"
          />
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={unknownDate} onChange={(e) => setUnknownDate(e.target.checked)} />
            Don't remember
          </label>
        </div>

        {!isTv && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={rewatch} onChange={(e) => setRewatch(e.target.checked)} />
            Rewatch
          </label>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-surface-2 py-3">
            Cancel
          </button>
          <button
            disabled={who.length === 0}
            onClick={() =>
              void onSave({
                memberIds: who,
                watchedOn: unknownDate ? null : date,
                ...(isTv && mode === "episode" ? { season, episode } : {}),
                isRewatch: !isTv && rewatch,
              })
            }
            className="flex-1 rounded-xl bg-accent py-3 font-semibold text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
