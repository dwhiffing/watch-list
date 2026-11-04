import type { ReactNode } from "react";
import type { Thumb, TitleSummary } from "../../shared/types";
import { img } from "../api";
import { useApp } from "../App";
import { Icon } from "./Icon";

export function Poster({ title, size = "w185", className = "" }: { title: Pick<TitleSummary, "posterPath" | "name">; size?: "w92" | "w185" | "w342" | "w500"; className?: string }) {
  const src = img(title.posterPath, size);
  return src ? (
    <img src={src} alt="" loading="lazy" className={`bg-surface-2 object-cover ${className}`} />
  ) : (
    <div className={`flex items-center justify-center bg-surface-2 p-1 text-center text-xs text-muted ${className}`}>{title.name}</div>
  );
}

export function TypeBadge({ type }: { type: "movie" | "tv" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-muted">
      <Icon name={type === "tv" ? "tv" : "film"} className="h-3 w-3" />
      {type === "tv" ? "Show" : "Movie"}
    </span>
  );
}

export function ServiceLogos({ serviceIds, size = "h-5 w-5" }: { serviceIds: number[]; size?: string }) {
  const { services } = useApp();
  const list = services.filter((s) => serviceIds.includes(s.id));
  if (list.length === 0) return null;
  return (
    <span className="inline-flex items-center gap-1">
      {list.map((s) => {
        const logo = img(s.logoPath, "w92");
        return logo ? (
          <img key={s.id} src={logo} alt={s.name} title={s.name} className={`${size} rounded`} />
        ) : (
          <span key={s.id} className="rounded bg-surface-2 px-1 text-[10px]">
            {s.name}
          </span>
        );
      })}
    </span>
  );
}

export function WantedBy({ memberIds }: { memberIds: number[] }) {
  const { me, members, nameOf } = useApp();
  if (memberIds.length === 0) return null;
  const everyone = members.length > 1 && members.every((m) => memberIds.includes(m.id));
  const label = everyone
    ? "You both want this"
    : memberIds.length === 1
      ? memberIds[0] === me.id
        ? "You want this"
        : `${nameOf(memberIds[0])} wants this`
      : `${memberIds.map(nameOf).join(" & ")} want this`;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
        everyone ? "bg-want/20 text-want" : "bg-surface-2 text-muted"
      }`}
    >
      <Icon name="heart" className="h-3 w-3" />
      {label}
    </span>
  );
}

export function ThumbIcon({ thumb, className = "h-4 w-4" }: { thumb: Thumb; className?: string }) {
  return <Icon name={thumb === 1 ? "up" : "down"} className={`${className} ${thumb === 1 ? "text-want" : "text-pass"}`} />;
}

export function Meta({ title }: { title: TitleSummary }) {
  const bits = [title.year, title.runtime ? `${title.runtime} min` : null, title.voteAverage ? `★ ${title.voteAverage.toFixed(1)}` : null].filter(Boolean);
  return <span className="text-sm text-muted">{bits.join(" · ")}</span>;
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between px-4 pt-4 pb-2">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </header>
  );
}

export function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1 text-sm ${active ? "border-accent bg-accent/15 text-accent" : "border-line text-muted"}`}
    >
      {children}
    </button>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="px-8 py-16 text-center text-muted">{children}</div>;
}

export function ErrorNote({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="mx-4 my-4 rounded-lg border border-pass/40 bg-pass/10 p-3 text-sm text-pass">
      {error}
      {onRetry && (
        <button className="ml-2 underline" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}
