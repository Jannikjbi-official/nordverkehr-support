/**
 * Zentrale Rechte-Logik – rein und testbar. JEDE Seite, Action, API-Route,
 * Suche, Statistik und jeder Export nutzt diese Funktionen. Keine verstreuten
 * Einzelprüfungen.
 *
 * Grundregeln:
 *  1. Wer in einem Vorgang als beschuldigtes Teammitglied eingetragen ist
 *     (`accusedDiscordIds`), sieht ihn nie – egal welche Stufe.
 *  2. Sensible Tickets (MOD_ONLY, TEAM_COMPLAINT) nur für Moderation/Leitung.
 *  3. Antragsarten haben eine Mindeststufe zum Sehen und eine zum Entscheiden.
 *  4. Vier-Augen-Prinzip: Vorschlag + Zustimmung einer anderen Person; wer die
 *     Strafe ausgesprochen hat, zählt nie als zweite Person.
 */
import type { Prisma, Sensitivity, TeamLevel } from "@prisma/client";
import { atLeast } from "@/lib/auth/access";

export interface Viewer {
  userId: string;
  discordId: string;
  teamLevel: TeamLevel;
}

// ─── Tickets ──────────────────────────────────────────────────

export interface TicketLike {
  creatorId: string;
  sensitivity: Sensitivity;
  accusedDiscordIds: string[];
}

/** Darf das Team-Mitglied das Ticket sehen (Team-Ansicht)? */
export function teamCanSeeTicket(viewer: Viewer, t: TicketLike): boolean {
  if (!atLeast(viewer.teamLevel, "SUPPORT")) return false;
  if (t.accusedDiscordIds.includes(viewer.discordId)) return false;
  if (t.sensitivity === "NORMAL") return true;
  // Beschwerde über ein (noch) unbekanntes Teammitglied: nur die Leitung, bis jemand zugeordnet ist
  if (t.sensitivity === "TEAM_COMPLAINT" && t.accusedDiscordIds.length === 0) return viewer.teamLevel === "LEITUNG";
  return atLeast(viewer.teamLevel, "MODERATION");
}

/** Spieler-Ansicht: nur eigene Tickets. */
export function playerOwnsTicket(viewer: Pick<Viewer, "userId">, t: Pick<TicketLike, "creatorId">) {
  return t.creatorId === viewer.userId;
}

/** Prisma-Filter für alle Team-Listen, Suchen, Statistiken und Exporte. */
export function ticketTeamWhere(viewer: Viewer): Prisma.TicketWhereInput {
  if (!atLeast(viewer.teamLevel, "SUPPORT")) return { id: "__none__" };
  const level: Prisma.TicketWhereInput =
    viewer.teamLevel === "LEITUNG"
      ? {}
      : atLeast(viewer.teamLevel, "MODERATION")
        ? { OR: [{ sensitivity: { not: "TEAM_COMPLAINT" } }, { accusedDiscordIds: { isEmpty: false } }] }
        : { sensitivity: "NORMAL" };
  return { AND: [{ NOT: { accusedDiscordIds: { has: viewer.discordId } } }, level] };
}

/**
 * Sichtbarkeit aus Kategorie und Angaben ableiten: Beschwerde über ein
 * Teammitglied → TEAM_COMPLAINT, sonst die Vorgabe der Kategorie.
 */
export function sensitivityFor(categoryDefault: Sensitivity, accusedDiscordIds: string[]): Sensitivity {
  if (accusedDiscordIds.length) return "TEAM_COMPLAINT";
  return categoryDefault;
}

/** Darf ein Ticket in einen (für Mods einsehbaren) Discord-Thread? Beschwerden über Teammitglieder nie. */
export function ticketMayUseDiscord(t: Pick<TicketLike, "sensitivity">) {
  return t.sensitivity !== "TEAM_COMPLAINT";
}

/** Wem darf ein Ticket weitergegeben werden? (Ziel muss es selbst sehen dürfen) */
export function canReceiveTicket(target: Viewer, t: TicketLike) {
  return teamCanSeeTicket(target, t);
}

// ─── Anträge ──────────────────────────────────────────────────

export interface RequestTypeLike {
  id: string;
  visibleFrom: TeamLevel;
  decideFrom: TeamLevel;
  fourEyes: boolean;
}

export interface RequestLike {
  applicantId: string;
  issuedByDiscordId: string | null;
  status: string;
}

export function teamCanSeeRequest(viewer: Viewer, type: Pick<RequestTypeLike, "visibleFrom">) {
  return atLeast(viewer.teamLevel, "SUPPORT") && atLeast(viewer.teamLevel, type.visibleFrom);
}

export function visibleRequestTypeIds(viewer: Viewer, types: Pick<RequestTypeLike, "id" | "visibleFrom">[]) {
  return types.filter((t) => teamCanSeeRequest(viewer, t)).map((t) => t.id);
}

export function requestTeamWhere(viewer: Viewer, types: Pick<RequestTypeLike, "id" | "visibleFrom">[]): Prisma.RequestWhereInput {
  return { typeId: { in: visibleRequestTypeIds(viewer, types) } };
}

export function canDecide(viewer: Viewer, type: Pick<RequestTypeLike, "decideFrom" | "visibleFrom">) {
  return teamCanSeeRequest(viewer, type) && atLeast(viewer.teamLevel, type.decideFrom);
}

export const OPEN_REQUEST_STATUSES = ["SUBMITTED", "IN_REVIEW", "QUESTION"] as const;

export function isOpenRequest(status: string) {
  return (OPEN_REQUEST_STATUSES as readonly string[]).includes(status);
}

/** Braucht ein Vorschlag eine zweite Person? */
export function needsSecondApproval(type: Pick<RequestTypeLike, "fourEyes">, request: Pick<RequestLike, "issuedByDiscordId">, proposer: Pick<Viewer, "discordId">) {
  if (type.fourEyes) return true;
  // Wer die Strafe ausgesprochen hat, entscheidet nie allein – auch ohne Vier-Augen-Pflicht
  return !!request.issuedByDiscordId && request.issuedByDiscordId === proposer.discordId;
}

export type ApprovalCheck = { ok: true } | { ok: false; reason: string };

/** Darf `viewer` den Vorschlag von `proposerId` bestätigen? */
export function checkApproval(
  viewer: Viewer,
  type: Pick<RequestTypeLike, "decideFrom" | "visibleFrom">,
  request: Pick<RequestLike, "issuedByDiscordId" | "status" | "applicantId">,
  decision: { proposedById: string; status: string },
): ApprovalCheck {
  if (!canDecide(viewer, type)) return { ok: false, reason: "Dafür fehlen dir die Rechte." };
  if (decision.status !== "PENDING") return { ok: false, reason: "Dieser Vorschlag ist nicht mehr offen." };
  if (!isOpenRequest(request.status)) return { ok: false, reason: "Der Antrag ist schon entschieden." };
  if (decision.proposedById === viewer.userId) return { ok: false, reason: "Vier-Augen-Prinzip: Den eigenen Vorschlag kann nur jemand anderes bestätigen." };
  if (request.issuedByDiscordId && request.issuedByDiscordId === viewer.discordId) {
    return { ok: false, reason: "Du hast die Strafe ausgesprochen – die Zustimmung muss von jemand anderem kommen." };
  }
  if (request.applicantId === viewer.userId) return { ok: false, reason: "Über eigene Anträge entscheidest du nicht." };
  return { ok: true };
}

/** Darf `viewer` einen Entscheidungsvorschlag machen? */
export function checkPropose(viewer: Viewer, type: Pick<RequestTypeLike, "decideFrom" | "visibleFrom">, request: Pick<RequestLike, "status" | "applicantId">): ApprovalCheck {
  if (!canDecide(viewer, type)) return { ok: false, reason: "Für diese Antragsart dürfen nur höhere Stufen entscheiden." };
  if (!isOpenRequest(request.status)) return { ok: false, reason: "Der Antrag ist schon entschieden." };
  if (request.applicantId === viewer.userId) return { ok: false, reason: "Über eigene Anträge entscheidest du nicht." };
  return { ok: true };
}

// ─── Spielerprofil ────────────────────────────────────────────

/** Strafen (Banns, Verwarnungen) im Profil sehen: nur Moderation/Leitung */
export const canSeeSanctions = (viewer: Viewer) => atLeast(viewer.teamLevel, "MODERATION");
/** Verwaltung (Antragsarten, Einstellungen, Export, Audit-Log) */
export const isLead = (viewer: Viewer) => viewer.teamLevel === "LEITUNG";
