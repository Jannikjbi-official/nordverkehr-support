import type { TicketStatus } from "@prisma/client";

export interface AutoCloseSettings {
  autoCloseDays: number;
  reminderHours: number;
  resolvedCloseDays: number;
}

export type AutoCloseAction = "remind" | "close" | "closeResolved" | null;

const H = 3600_000;
const D = 24 * H;

/**
 * Rein: Was ist mit einem Ticket fällig?
 *  - „wartet auf Spieler“: Erinnerung `reminderHours` vor Ablauf; geschlossen wird
 *    frühestens nach Ablauf UND frühestens `reminderHours` nach der Erinnerung
 *    (niemand wird ohne Vorwarnung geschlossen).
 *  - „gelöst“: nach `resolvedCloseDays` geschlossen.
 */
export function autoCloseAction(
  t: { status: TicketStatus; waitingSince: Date | null; autoCloseWarnedAt: Date | null; resolvedAt: Date | null },
  s: AutoCloseSettings,
  now = new Date(),
): AutoCloseAction {
  if (t.status === "WAITING_PLAYER" && t.waitingSince) {
    const closeAt = t.waitingSince.getTime() + s.autoCloseDays * D;
    const remindAt = closeAt - s.reminderHours * H;
    if (!t.autoCloseWarnedAt) return now.getTime() >= remindAt ? "remind" : null;
    const earliest = Math.max(closeAt, t.autoCloseWarnedAt.getTime() + s.reminderHours * H);
    return now.getTime() >= earliest ? "close" : null;
  }
  if (t.status === "RESOLVED" && t.resolvedAt) {
    return now.getTime() >= t.resolvedAt.getTime() + s.resolvedCloseDays * D ? "closeResolved" : null;
  }
  return null;
}
