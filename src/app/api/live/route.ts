import { getCurrentUser } from "@/lib/auth/session";
import { liveVersion, parseLiveScope } from "@/lib/live";
import { viewerOf } from "@/lib/tickets/service";

/**
 * Kleiner Versions-Abruf für Live-Aktualisierung (siehe src/lib/live.ts).
 * Bewusst schlank: Login aus dem Sitzungs-Cookie + Team-Stufe aus der DB
 * (kein Discord-Abruf) – die eigentliche Seite prüft beim Neuladen ohnehin voll.
 */
export async function GET(req: Request) {
  const scope = parseLiveScope(new URL(req.url).searchParams);
  if (!scope) return Response.json({ error: "Ungültig" }, { status: 400 });
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Nicht eingeloggt" }, { status: 401 });
  const level = user.guildBanned ? "NONE" : user.teamLevel;
  const v = await liveVersion(scope, viewerOf(user, level));
  if (v === null) return Response.json({ error: "Nicht gefunden" }, { status: 404 });
  return Response.json({ v }, { headers: { "Cache-Control": "private, no-store" } });
}
