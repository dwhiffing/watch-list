import { useEffect, useState } from "react";
import type { HistoryEntry } from "../../shared/types";
import { api } from "../api";
import { useApp } from "../App";
import { href } from "../router";
import { Empty, ErrorNote, PageHeader, Poster, ThumbIcon, TypeBadge } from "../components/bits";

export function Watched() {
  const { nameOf, members } = useApp();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.history().then(
      (r) => setEntries(r.entries),
      (err: Error) => setError(err.message),
    );
  }, []);

  return (
    <div className="pb-6">
      <PageHeader title="Watched" />
      {error && <ErrorNote error={error} />}
      {!entries && !error && <Empty>Loading…</Empty>}
      {entries?.length === 0 && <Empty>Nothing logged yet. Mark something as watched, or swipe up on a card you've already seen.</Empty>}
      <ul>
        {entries?.map(({ event, title, ratings }) => {
          const everyone = members.length > 1 && members.every((m) => event.memberIds.includes(m.id));
          return (
            <li key={event.id} className="border-b border-line/60">
              <a href={href({ name: "title", id: title.id })} className="flex items-center gap-3 px-4 py-3">
                <Poster title={title} size="w92" className="h-16 w-11 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{title.name}</div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <TypeBadge type={title.type} />
                    <span>{event.watchedOn ? formatDate(event.watchedOn) : "Seen before"}</span>
                    <span>· {everyone ? "Together" : event.memberIds.map(nameOf).join(", ")}</span>
                    {event.isRewatch && <span>· Rewatch</span>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {Object.entries(ratings).map(([memberId, thumb]) => (
                    <span key={memberId} className="flex items-center gap-1 text-xs text-muted">
                      {nameOf(Number(memberId))}
                      <ThumbIcon thumb={thumb} />
                    </span>
                  ))}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
