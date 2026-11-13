import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { classifyRoute, decideAccess } from "@/lib/auth/routes";
import { getAccess, loadUserFromSession } from "@/lib/auth/user-access";

/**
 * Proxy (ehemals Middleware). Läuft im Node.js-Runtime und prüft vor jeder
 * geschützten Route Login, Bann-Status und – für /team und /api/team – die
 * Discord-Rolle. Jede Seite/Action prüft zusätzlich selbst.
 */
export default auth(async (req) => {
  const { pathname, search } = req.nextUrl;
  const kind = classifyRoute(pathname);
  if (kind === "public") return NextResponse.next();

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
