import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { classifyRoute, decideAccess } from "@/lib/auth/routes";
import { getAccess, loadUserFromSession } from "@/lib/auth/user-access";

/**
 * Proxy (ehemals Middleware). Läuft im Node.js-Runtime.
 *  - Seiten: nur „eingeloggt?“ (aus dem Sitzungs-Cookie, ohne DB) – Bann-Status
 *    und Rolle prüft jede Seite selbst, sonst liefe alles doppelt.
 *  - APIs: voller Check (Login, Bann, Team-Rolle) – zusätzlich zu den Handlern.
 */
export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const kind = classifyRoute(pathname);
  if (kind === "public") return NextResponse.next();

  // Seiten: nur Login prüfen (JWT, ohne Datenbank) – Bann/Team prüft jede Seite selbst
  // (requirePlayer/requireTeam). Spart pro Seitenwechsel DB- und Discord-Abfragen.
  if (kind === "team-page" || kind === "user-page") {
    if (req.auth?.uid) return NextResponse.next();
    return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(pathname + search)}`, req.nextUrl.origin));
  }

  const user = await loadUserFromSession(req.auth);
  const access = user ? await getAccess(user) : null;

  const decision = decideAccess(kind, pathname + search, {
    loggedIn: !!user,
    isTeam: !!access?.isTeam,
    banned: !!access?.guildBanned,
  });
  switch (decision.action) {
    case "next":
      return NextResponse.next();
    case "redirect":
      return NextResponse.redirect(new URL(decision.to, req.nextUrl.origin));
    case "json":
      return NextResponse.json({ error: decision.error }, { status: decision.status });
  }
});

export const config = {
  matcher: [
    "/team/:path*",
    "/api/team/:path*",
    "/dashboard/:path*",
    "/tickets/:path*",
    "/antraege/:path*",
    "/konto/:path*",
    "/api/me/:path*",
    "/api/uploads/:path*",
  ],
};
