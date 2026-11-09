import type { TitleDetail } from "../../shared/types";
import { img } from "../api";
import { ServiceLogos } from "./bits";

export function ServicesNote({ serviceIds }: { serviceIds: number[] }) {
  return serviceIds.length > 0 ? (
    <span className="flex items-center gap-2 text-xs text-muted">
      On <ServiceLogos serviceIds={serviceIds} size="h-6 w-6" />
    </span>
  ) : (
    <span className="text-xs text-muted">Not on your services</span>
  );
}

/** Overview, director/creator and cast. Shared by the title page and the Discover info sheet. */
export function TitleAbout({ title: t }: { title: TitleDetail }) {
  return (
    <>
      {t.overview && <p className="mt-6 max-w-3xl px-4 leading-relaxed text-white/85">{t.overview}</p>}

      {t.directors.length > 0 && (
        <p className="mt-4 px-4 text-sm">
          <span className="text-muted">{t.type === "tv" ? "Created by" : "Directed by"} </span>
          {t.directors.join(", ")}
        </p>
      )}

      {t.cast.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-4 text-sm font-semibold tracking-wide text-muted uppercase">Cast</h2>
          <ul className="no-scrollbar flex gap-3 overflow-x-auto px-4">
            {t.cast.map((c) => {
              const photo = img(c.profilePath, "w185");
              return (
                <li key={c.name} className="w-20 shrink-0 text-center">
                  {photo ? (
                    <img src={photo} alt="" loading="lazy" className="mx-auto h-20 w-20 rounded-full object-cover" />
                  ) : (
                    <div className="mx-auto h-20 w-20 rounded-full bg-surface-2" />
                  )}
                  <div className="mt-1 text-xs leading-tight">{c.name}</div>
                  {c.character && <div className="text-[11px] leading-tight text-muted">{c.character}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
