import { useState } from "react";
import { api, img } from "../api";
import { useApp } from "../App";
import { ErrorNote, PageHeader } from "../components/bits";

export function Settings() {
  const { me, members, services, region, reload, reloadServices } = useApp();
  const [name, setName] = useState(me.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<number, boolean>>({});

  const saveName = async () => {
    setSaving(true);
    try {
      await api.rename(name);
      await reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (id: number, enabled: boolean) => {
    setPending((p) => ({ ...p, [id]: enabled }));
    try {
      await api.setService(id, enabled);
      await reloadServices();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(({ [id]: _, ...rest }) => rest);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <PageHeader title="Settings" />
      {error && <ErrorNote error={error} />}

      <section className="px-4">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">Your name</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 py-2 outline-none focus:border-accent"
          />
          <button
            onClick={() => void saveName()}
            disabled={saving || !name.trim() || name === me.name}
            className="rounded-xl bg-accent px-4 py-2 font-medium text-black disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </section>

      <section className="px-4">
        <h2 className="mb-1 text-sm font-semibold tracking-wide text-muted uppercase">Streaming services</h2>
        <p className="mb-3 text-xs text-muted">
          Turn on the services you pay for. Shared by both of you. Availability is for {region === "CA" ? "Canada" : region}.
        </p>
        <ul className="divide-y divide-line/60 rounded-xl border border-line bg-surface">
          {services.map((s) => {
            const logo = img(s.logoPath, "w92");
            return (
              <li key={s.id}>
                <label className="flex cursor-pointer items-center gap-3 px-4 py-3">
                  {logo ? <img src={logo} alt="" className="h-8 w-8 rounded-md" /> : <span className="h-8 w-8 rounded-md bg-surface-2" />}
                  <span className="flex-1">{s.name}</span>
                  <input
                    type="checkbox"
                    checked={pending[s.id] ?? s.enabled}
                    onChange={(e) => void toggle(s.id, e.target.checked)}
                    className="h-5 w-5 accent-[var(--color-accent)]"
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="px-4">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-muted uppercase">People</h2>
        <ul className="text-sm">
          {members.map((m) => (
            <li key={m.id} className="py-1">
              {m.name}
              {m.id === me.id && <span className="text-muted"> (you)</span>}
            </li>
          ))}
        </ul>
        {members.length < 2 && <p className="mt-1 text-xs text-muted">Your partner shows up here after they sign in for the first time.</p>}
      </section>

      <section className="px-4">
        <button
          onClick={async () => {
            await api.logout();
            window.location.hash = "#/discover";
            window.location.reload();
          }}
          className="rounded-xl border border-line px-4 py-2 text-sm text-muted"
        >
          Sign out
        </button>
        <p className="mt-2 text-xs text-muted">Sign out to switch to the other person on this device.</p>
      </section>

      <footer className="space-y-1 px-4 text-xs text-muted">
        <p>This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
        <p>Streaming availability data provided by JustWatch.</p>
      </footer>
    </div>
  );
}
