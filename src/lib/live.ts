/**
 * Live-Aktualisierung ohne WebSockets (Vercel ist serverless): Die Seite fragt
 * alle paar Sekunden eine kleine „Version“ ab. Nur wenn sie sich ändert, lädt
 * der Browser die Seite im Hintergrund neu (router.refresh) – neue Nachrichten
 * erscheinen so ohne Neuladen.
 *
 * Die Version hängt von der Perspektive ab: Spieler sehen nie, dass das Team
 * eine interne Notiz geschrieben hat (sie zählt für sie nicht mit).
 */
import { db } from "@/lib/db";
import { requestTeamWhere, teamCanSeeRequest, teamCanSeeTicket, ticketTeamWhere, type Viewer } from "@/lib/perms";
import { atLeast } from "@/lib/auth/access";

export type LiveScope =
  | { type: "ticket"; id: string; perspective: "player" | "team" }
  | { type: "request"; id: string; perspective: "player" | "team" }
  | { type: "team-tickets" }
  | { type: "team-requests" };

const ms = (d: Date | null | undefined) => (d ? d.getTime().toString(36) : "0");

/** Version für den Betrachter – `null`, wenn er das nicht sehen darf. */
export async function liveVersion(scope: LiveScope, viewer: Viewer): Promise<string | null> {
  switch (scope.type) {
    case "ticket": {
      const t = await db.ticket.findUnique({
        where: { id: scope.id },
        select: { creatorId: true, sensitivity: true, accusedDiscordIds: true, status: true, updatedAt: true, claimedById: true, rating: true },
      });
      if (!t) return null;
      if (scope.perspective === "player") {
        if (t.creatorId !== viewer.userId) return null;
        const m = await db.ticketMessage.aggregate({ where: { ticketId: scope.id, kind: { not: "INTERNAL" } }, _count: true, _max: { createdAt: true } });
        return `p.${t.status}.${t.claimedById ?? "-"}.${t.rating ?? 0}.${m._count}.${ms(m._max.createdAt)}`;
      }
      if (!teamCanSeeTicket(viewer, t)) return null;
      const m = await db.ticketMessage.aggregate({ where: { ticketId: scope.id }, _count: true, _max: { createdAt: true } });
      return `t.${ms(t.updatedAt)}.${m._count}.${ms(m._max.createdAt)}`;
    }
    case "request": {
      const r = await db.request.findUnique({ where: { id: scope.id }, select: { applicantId: true, status: true, updatedAt: true, type: { select: { visibleFrom: true } } } });
      if (!r) return null;
      if (scope.perspective === "player") {
        if (r.applicantId !== viewer.userId) return null;
        const m = await db.requestMessage.aggregate({ where: { requestId: scope.id, kind: { in: ["PLAYER", "TEAM", "SYSTEM"] } }, _count: true, _max: { createdAt: true } });
        return `p.${r.status}.${m._count}.${ms(m._max.createdAt)}`;
      }
      if (!teamCanSeeRequest(viewer, r.type)) return null;
      const [m, c, v, d] = await Promise.all([
        db.requestMessage.aggregate({ where: { requestId: scope.id }, _count: true, _max: { createdAt: true } }),
        db.requestComment.count({ where: { requestId: scope.id } }),
        db.requestVote.aggregate({ where: { requestId: scope.id }, _count: true, _max: { updatedAt: true } }),
        db.requestDecision.count({ where: { requestId: scope.id } }),
      ]);
      return `t.${ms(r.updatedAt)}.${m._count}.${ms(m._max.createdAt)}.${c}.${v._count}.${ms(v._max.updatedAt)}.${d}`;
    }
    case "team-tickets": {
      if (!atLeast(viewer.teamLevel, "SUPPORT")) return null;
      const a = await db.ticket.aggregate({ where: ticketTeamWhere(viewer), _count: true, _max: { updatedAt: true } });
      return `l.${a._count}.${ms(a._max.updatedAt)}`;
    }
    case "team-requests": {
      if (!atLeast(viewer.teamLevel, "SUPPORT")) return null;
      const types = await db.requestType.findMany({ select: { id: true, visibleFrom: true } });
      const a = await db.request.aggregate({ where: requestTeamWhere(viewer, types), _count: true, _max: { updatedAt: true } });
      return `l.${a._count}.${ms(a._max.updatedAt)}`;
    }
  }
}

/** Query-Parameter → Scope (für die API) */
export function parseLiveScope(params: URLSearchParams): LiveScope | null {
  const type = params.get("type");
  const id = params.get("id") ?? "";
  const perspective = params.get("p") === "team" ? "team" : "player";
  const validId = /^[a-z0-9]{10,40}$/i.test(id);
  if ((type === "ticket" || type === "request") && validId) return { type, id, perspective };
  if (type === "team-tickets" || type === "team-requests") return { type };
  return null;
}

export function liveScopeQuery(scope: LiveScope): string {
  const q = new URLSearchParams({ type: scope.type });
  if ("id" in scope) {
    q.set("id", scope.id);
    q.set("p", scope.perspective);
  }
  return q.toString();
}
