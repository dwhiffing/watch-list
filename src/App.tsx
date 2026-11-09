import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Member, MeResponse, StreamingService } from "../shared/types";
import { api, ApiError } from "./api";
import { href, useRoute, type Route } from "./router";
import { Discover } from "./pages/Discover";
import { Watchlist } from "./pages/Watchlist";
import { Search } from "./pages/Search";
import { Watched } from "./pages/Watched";
import { Settings } from "./pages/Settings";
import { Login } from "./pages/Login";
import { TitlePage } from "./pages/TitlePage";
import { Icon, type IconName } from "./components/Icon";

interface AppState {
  me: Member;
  members: Member[];
  region: string;
  services: StreamingService[];
  nameOf: (memberId: number) => string;
  partner: Member | null;
  reload: () => Promise<void>;
  reloadServices: () => Promise<void>;
}

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside provider");
  return ctx;
}

const tabs: { route: Route; label: string; icon: IconName }[] = [
  { route: { name: "discover" }, label: "Discover", icon: "cards" },
  { route: { name: "watchlist" }, label: "Watchlist", icon: "list" },
  { route: { name: "search" }, label: "Search", icon: "search" },
  { route: { name: "watched" }, label: "Watched", icon: "check" },
  { route: { name: "settings" }, label: "Settings", icon: "gear" },
];

export function App() {
  const route = useRoute();
  const [meData, setMeData] = useState<MeResponse | null>(null);
  const [services, setServices] = useState<StreamingService[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);

  const reload = useCallback(async () => {
    try {
      setMeData(await api.me());
      setSignedOut(false);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setSignedOut(true);
      else setError(String((err as Error).message));
    }
  }, []);

  const reloadServices = useCallback(async () => {
    try {
      setServices((await api.services()).services);
    } catch {
      /* shown elsewhere */
    }
  }, []);

  useEffect(() => {
    void reload();
    void reloadServices();
  }, [reload, reloadServices]);

  const state = useMemo<AppState | null>(() => {
    if (!meData) return null;
    const byId = new Map(meData.members.map((m) => [m.id, m]));
    return {
      ...meData,
      services,
      nameOf: (id) => (id === meData.me.id ? "You" : (byId.get(id)?.name ?? "Someone")),
      partner: meData.members.find((m) => m.id !== meData.me.id) ?? null,
      reload,
      reloadServices,
    };
  }, [meData, services, reload, reloadServices]);

  if (signedOut) {
    return (
      <Login
        onSignedIn={() => {
          void reload();
          void reloadServices();
        }}
      />
    );
  }
  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-muted">
        <div>
          <p className="mb-4">{error}</p>
          <button className="rounded-full bg-surface-2 px-4 py-2 text-white" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  if (!state) return <div className="flex h-full items-center justify-center text-muted">Loading…</div>;

  const activeTab = route.name === "title" ? null : route.name;

  return (
    <AppContext.Provider value={state}>
      <div className="mx-auto flex h-full max-w-lg flex-col">
        <main className="pt-safe min-h-0 flex-1 overflow-y-auto">
          {/* Discover stays mounted so the deck keeps its place while you look at a title */}
          <div className={route.name === "discover" ? "h-full" : "hidden"}>
            <Discover />
          </div>
          {route.name === "watchlist" && <Watchlist />}
          {route.name === "search" && <Search />}
          {route.name === "watched" && <Watched />}
          {route.name === "settings" && <Settings />}
          {route.name === "title" && <TitlePage key={route.id} id={route.id} />}
        </main>
        <nav className="pb-safe border-t border-line bg-bg/95 backdrop-blur">
          <ul className="flex">
            {tabs.map((t) => {
              const active = activeTab === t.route.name;
              return (
                <li key={t.label} className="flex-1">
                  <a
                    href={href(t.route)}
                    className={`flex flex-col items-center gap-1 py-2 text-[11px] ${active ? "text-accent" : "text-muted"}`}
                  >
                    <Icon name={t.icon} className="h-6 w-6" />
                    {t.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </AppContext.Provider>
  );
}
