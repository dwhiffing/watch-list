import { useEffect, useState } from "react";

export type Route =
  | { name: "discover" }
  | { name: "watchlist" }
  | { name: "search" }
  | { name: "watched" }
  | { name: "settings" }
  | { name: "title"; id: number };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/");
  switch (parts[0]) {
    case "watchlist":
      return { name: "watchlist" };
    case "search":
      return { name: "search" };
    case "watched":
      return { name: "watched" };
    case "settings":
      return { name: "settings" };
    case "title": {
      const id = Number(parts[1]);
      return Number.isFinite(id) && id > 0 ? { name: "title", id } : { name: "discover" };
    }
    default:
      return { name: "discover" };
  }
}

export function href(route: Route): string {
  return route.name === "title" ? `#/title/${route.id}` : `#/${route.name}`;
}

export function navigate(route: Route) {
  window.location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
