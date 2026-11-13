/**
 * Routen-Klassifizierung für den Proxy. Rein und testbar.
 * Wichtig: Der Proxy ist nur die erste Hürde – jede Seite, jede Server
 * Action und jeder Route-Handler prüft zusätzlich selbst (requireTeam & Co.).
 */
export type RouteKind = "team-page" | "team-api" | "user-page" | "user-api" | "public";

const USER_PAGE_PREFIXES = ["/dashboard", "/tickets", "/antraege", "/konto"];
const USER_API_PREFIXES = ["/api/me", "/api/uploads"];

/** Was vom Discord gebannte Personen sehen dürfen (neben öffentlichen Seiten) */
const BANNED_ALLOWED = ["/antraege", "/konto", "/api/me", "/api/uploads"];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function normalizePath(pathname: string) {
  return ("/" + pathname.split("/").filter(Boolean).join("/")).toLowerCase();
}

export function classifyRoute(pathname: string): RouteKind {
  const p = normalizePath(pathname);
  if (matches(p, "/api/team")) return "team-api";
  if (matches(p, "/team")) return "team-page";
  if (USER_API_PREFIXES.some((x) => matches(p, x))) return "user-api";
  if (USER_PAGE_PREFIXES.some((x) => matches(p, x))) return "user-page";
  return "public";
}

export function bannedMayAccess(pathname: string) {
  const p = normalizePath(pathname);
  return BANNED_ALLOWED.some((x) => matches(p, x));
}

export type ProxyDecision =
  | { action: "next" }
  | { action: "redirect"; to: string }
  | { action: "json"; status: 401 | 403; error: string };

export function decideAccess(
  kind: RouteKind,
  pathWithSearch: string,
  state: { loggedIn: boolean; isTeam: boolean; banned: boolean },
): ProxyDecision {
  if (kind === "public") return { action: "next" };
  const isApi = kind === "team-api" || kind === "user-api";

  if (!state.loggedIn) {
    return isApi
      ? { action: "json", status: 401, error: "Nicht eingeloggt." }
      : { action: "redirect", to: `/login?callbackUrl=${encodeURIComponent(pathWithSearch)}` };
  }

  // Vom Discord gebannt: nur Anträge (Entbannung) und Konto
  if (state.banned && !bannedMayAccess(pathWithSearch.split("?")[0])) {
    return isApi ? { action: "json", status: 403, error: "Gesperrt – nur Anträge möglich." } : { action: "redirect", to: "/antraege?gesperrt=1" };
  }

  if ((kind === "team-page" || kind === "team-api") && !state.isTeam) {
    return isApi ? { action: "json", status: 403, error: "Kein Zugriff." } : { action: "redirect", to: "/kein-zugriff" };
  }

  return { action: "next" };
}
