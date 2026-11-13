import type { TicketPriority, TicketStatus } from "@prisma/client";

export const TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_PLAYER", "RESOLVED", "CLOSED"];

export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  WAITING_PLAYER: "Wartet auf dich",
  RESOLVED: "Gelöst",
  CLOSED: "Geschlossen",
};

/** Team-Sicht: „Wartet auf Spieler“ statt „Wartet auf dich“ */
export const TICKET_STATUS_LABEL_TEAM: Record<TicketStatus, string> = { ...TICKET_STATUS_LABEL, WAITING_PLAYER: "Wartet auf Spieler" };

export const TICKET_STATUS_TONE: Record<TicketStatus, "info" | "warn" | "accent" | "success" | "muted"> = {
  OPEN: "accent",
  IN_PROGRESS: "info",
  WAITING_PLAYER: "warn",
  RESOLVED: "success",
  CLOSED: "muted",
};

export const TICKET_STATUS_EMOJI: Record<TicketStatus, string> = {
  OPEN: "🟥",
  IN_PROGRESS: "🟦",
  WAITING_PLAYER: "🟨",
  RESOLVED: "🟩",
  CLOSED: "⬛",
};

export const ACTIVE_TICKET_STATUSES: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_PLAYER"];

export const PRIORITIES: TicketPriority[] = ["LOW", "NORMAL", "HIGH", "URGENT"];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { LOW: "Niedrig", NORMAL: "Normal", HIGH: "Hoch", URGENT: "Dringend" };
export const PRIORITY_TONE: Record<TicketPriority, "muted" | "info" | "warn" | "danger"> = { LOW: "muted", NORMAL: "info", HIGH: "warn", URGENT: "danger" };

/** Erlaubte Übergänge fürs Team (Spieler können nur schließen bzw. durch Antwort wieder öffnen). */
export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  if (from === "CLOSED") return to === "OPEN"; // wieder öffnen
  return true;
}

/**
 * Automatik: Wer zuletzt geschrieben hat, bestimmt den Status.
 *  - Team antwortet → „wartet auf Spieler“ (außer bei gelöst/geschlossen)
 *  - Spieler antwortet → „in Bearbeitung“ (geschlossen/gelöst wird wieder geöffnet)
 */
export function statusAfterMessage(current: TicketStatus, by: "PLAYER" | "TEAM"): TicketStatus {
  if (by === "TEAM") return current === "RESOLVED" || current === "CLOSED" ? current : "WAITING_PLAYER";
  if (current === "OPEN" || current === "CLOSED") return current;
  return "IN_PROGRESS";
}
