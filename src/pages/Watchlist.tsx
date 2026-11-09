import { useCallback, useEffect, useState } from 'react'
import type { WatchlistItem } from '../../shared/types'
import { api } from '../api'
import { useApp } from '../App'
import { href } from '../router'
import {
  Chip,
  Empty,
  ErrorNote,
  Meta,
  PageHeader,
  Poster,
  ServiceLogos,
  TypeBadge,
  WantedBy,
} from '../components/bits'

type MediaFilter = 'all' | 'movie' | 'tv'

export function Watchlist() {
  const { services } = useApp()
  const [data, setData] = useState<{
    items: WatchlistItem[]
    watching: WatchlistItem[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [media, setMedia] = useState<MediaFilter>('all')
  const [onServices, setOnServices] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api.watchlist())
      setError(null)
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const hasServices = services.some((s) => s.enabled)
  const filter = (items: WatchlistItem[]) =>
    items.filter(
      (i) =>
        (media === 'all' || i.type === media) &&
        (!onServices || i.services.length > 0),
    )

  const remove = async (item: WatchlistItem) => {
    setData(
      (d) => d && { ...d, items: d.items.filter((i) => i.id !== item.id) },
    )
    try {
      await api.removeFromWatchlist(item.id)
    } catch (err) {
      setError((err as Error).message)
      void load()
    }
  }

  const items = data ? filter(data.items) : []
  const watching = data ? filter(data.watching) : []

  return (
    <div className="pb-6">
      <PageHeader title="Watchlist" />
      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
        {(['all', 'movie', 'tv'] as const).map((m) => (
          <Chip key={m} active={media === m} onClick={() => setMedia(m)}>
            {m === 'all' ? 'Everything' : m === 'movie' ? 'Movies' : 'Shows'}
          </Chip>
        ))}
        {hasServices && (
          <Chip active={onServices} onClick={() => setOnServices((v) => !v)}>
            On our services
          </Chip>
        )}
      </div>

      {error && <ErrorNote error={error} onRetry={() => void load()} />}
      {!data && !error && <Empty>Loading…</Empty>}

      {watching.length > 0 && (
        <section className="mb-4">
          <h2 className="px-4 pb-2 text-sm font-semibold tracking-wide text-muted uppercase">
            Continue watching
          </h2>
          <ul className="md:grid lg:grid-cols-2 md:gap-x-4">
            {watching.map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section>
          {watching.length > 0 && (
            <h2 className="px-4 pb-2 text-sm font-semibold tracking-wide text-muted uppercase">
              Up next
            </h2>
          )}
          {items.length === 0 ? (
            <Empty>
              {data.items.length === 0 ? (
                <>
                  Nothing here yet. Swipe right on{' '}
                  <a href="#/discover" className="text-accent">
                    Discover
                  </a>{' '}
                  or add titles from{' '}
                  <a href="#/search" className="text-accent">
                    Search
                  </a>
                  .
                </>
              ) : (
                'Nothing matches these filters.'
              )}
            </Empty>
          ) : (
            <ul className="md:grid lg:grid-cols-2 md:gap-x-4">
              {items.map((item) => (
                <Row
                  key={item.id}
                  item={item}
                  onRemove={() => void remove(item)}
                />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function Row({
  item,
  onRemove,
}: {
  item: WatchlistItem
  onRemove?: () => void
}) {
  return (
    <li className="flex items-center gap-3 border-b border-line/60 px-4 py-3">
      <a
        href={href({ name: 'title', id: item.id })}
        className="flex min-w-0 flex-1 items-center gap-3">
        <Poster title={item} className="h-24 w-16 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{item.name}</div>
          <div className="flex items-center gap-2">
            <TypeBadge type={item.type} />
            <Meta title={item} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {item.progress ? (
              <span className="text-xs text-seen">
                Watched up to S{item.progress.season} E{item.progress.episode}
              </span>
            ) : (
              <WantedBy memberIds={item.wantedBy} />
            )}
            <ServiceLogos serviceIds={item.services} />
          </div>
        </div>
      </a>
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${item.name}`}
          className="shrink-0 rounded-full px-2 py-1 text-xs text-muted">
          Remove
        </button>
      )}
    </li>
  )
}
