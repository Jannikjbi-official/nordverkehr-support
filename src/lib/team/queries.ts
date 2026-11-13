import "server-only";
import type { Prisma, TicketPriority, TicketStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { ticketTeamWhere, type Viewer } from "@/lib/perms";
import { ACTIVE_TICKET_STATUSES, PRIORITIES, TICKET_STATUSES } from "@/lib/tickets/status";
import { CATEGORY_KEYS } from "@/lib/tickets/categories";

export interface TicketFilters {
  status?: string;
  category?: string;
  priority?: string;
  assigned?: "me" | "free" | "";
  q?: string;
  tag?: string;
}

export function parseTicketFilters(sp: Record<string, string | string[] | undefined>): TicketFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  return {
    status: TICKET_STATUSES.includes(s("status") as TicketStatus) || s("status") === "aktiv" || s("status") === "alle" ? s("status") : "aktiv",
    category: CATEGORY_KEYS.includes(s("kategorie")) ? s("kategorie") : "",
    priority: PRIORITIES.includes(s("prio") as TicketPriority) ? s("prio") : "",
    assigned: s("zugewiesen") === "me" || s("zugewiesen") === "free" ? (s("zugewiesen") as "me" | "free") : "",
    q: s("q").trim().slice(0, 80),
    tag: s("tag").trim().slice(0, 24).toLowerCase(),
  };
}

/** Team-Ticketliste – IMMER mit Sichtbarkeitsfilter (Beschwerden über Teammitglieder!) */
export async function listTeamTickets(viewer: Viewer, f: TicketFilters, take = 200) {
  const and: Prisma.TicketWhereInput[] = [ticketTeamWhere(viewer)];
  if (f.status === "aktiv") and.push({ status: { in: [...ACTIVE_TICKET_STATUSES, "RESOLVED"] } });
  else if (f.status && f.status !== "alle") and.push({ status: f.status as TicketStatus });
  if (f.category) and.push({ category: f.category });
  if (f.priority) and.push({ priority: f.priority as TicketPriority });
  if (f.assigned === "me") and.push({ claimedById: viewer.userId });
  if (f.assigned === "free") and.push({ claimedById: null });
  if (f.tag) and.push({ tags: { has: f.tag } });
  if (f.q) {
    const q = f.q;
    const users = await db.user.findMany({ where: { OR: [{ username: { contains: q, mode: "insensitive" } }, { globalName: { contains: q, mode: "insensitive" } }, { discordId: q }] }, select: { id: true }, take: 50 });
    const msgTickets = await db.ticketMessage.findMany({ where: { body: { contains: q, mode: "insensitive" }, kind: { not: "INTERNAL" } }, select: { ticketId: true }, take: 200 });
    and.push({
      OR: [
        { publicId: { contains: q.toUpperCase() } },
        { subject: { contains: q, mode: "insensitive" } },
        { creatorId: { in: users.map((u) => u.id) } },
        { id: { in: [...new Set(msgTickets.map((m) => m.ticketId))] } },
      ],
    });
  }
  return db.ticket.findMany({
    where: { AND: and },
    orderBy: [{ updatedAt: "desc" }],
    take,
    include: { creator: { select: { id: true, username: true, globalName: true, discordId: true, avatar: true } }, claimedBy: { select: { id: true, username: true, globalName: true } } },
  });
}

/** Teammitglieder für Weitergabe/Beschuldigte */
export function listTeamMembers() {
  return db.user.findMany({ where: { teamLevel: { not: "NONE" } }, select: { id: true, username: true, globalName: true, discordId: true, teamLevel: true }, orderBy: { globalName: { sort: "asc", nulls: "last" } } });
}
