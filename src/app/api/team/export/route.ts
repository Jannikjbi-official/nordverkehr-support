import { db } from "@/lib/db";
import { accessErrorResponse, assertTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { toCsv } from "@/lib/csv";
import { requestTeamWhere, ticketTeamWhere } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { categoryLabel } from "@/lib/tickets/categories";

/** CSV-Export (nur Leitung) – ebenfalls mit Sichtbarkeitsfilter, ohne Nachrichteninhalte */
export async function GET(req: Request) {
  let user, access;
  try {
    ({ user, access } = await assertTeam("LEITUNG"));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const url = new URL(req.url);
  const art = url.searchParams.get("art") === "antraege" ? "antraege" : "tickets";
  const days = Math.min(3650, Math.max(1, Number(url.searchParams.get("zeitraum")) || 30));
  const since = new Date(Date.now() - days * 86_400_000);
  const viewer = viewerOf(user, access.teamLevel);
  const iso = (d: Date | null) => (d ? d.toISOString() : "");
  let csv: string;
  if (art === "tickets") {
    const rows = await db.ticket.findMany({
      where: { AND: [ticketTeamWhere(viewer), { createdAt: { gte: since } }] },
      orderBy: { createdAt: "asc" },
      include: { creator: { select: { username: true } }, claimedBy: { select: { username: true } } },
    });
    csv = toCsv(
      ["ID", "Kategorie", "Betreff", "Status", "Priorität", "Quelle", "Spieler", "Betreut", "Erstellt", "Erste Antwort", "Gelöst", "Geschlossen", "Bewertung", "Tags"],
      rows.map((t) => [t.publicId, categoryLabel(t.category), t.subject, t.status, t.priority, t.source, t.creator.username, t.claimedBy?.username ?? "", iso(t.createdAt), iso(t.firstResponseAt), iso(t.resolvedAt), iso(t.closedAt), t.rating ?? "", t.tags.join(" ")]),
    );
  } else {
    const types = await db.requestType.findMany();
    const rows = await db.request.findMany({
      where: { AND: [requestTeamWhere(viewer, types), { createdAt: { gte: since } }] },
      orderBy: { createdAt: "asc" },
      include: { type: { select: { title: true } }, applicant: { select: { username: true } } },
    });
    csv = toCsv(
      ["ID", "Art", "Status", "Ergebnis", "Antragsteller", "Eingereicht", "Entschieden"],
      rows.map((r) => [r.publicId, r.type.title, r.status, r.outcomeLabel ?? "", r.applicant.username, iso(r.createdAt), iso(r.decidedAt)]),
    );
  }
  await audit("export.csv", { actorId: user.id, meta: { art, days } });
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="nordverkehr-${art}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
