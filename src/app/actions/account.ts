"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";

export async function setDmOptOutAction(optOut: boolean): Promise<ActionResult> {
  try {
    const { user } = await requireUser("/konto");
    await db.user.update({ where: { id: user.id }, data: { dmOptOut: !!optOut } });
    revalidatePath("/konto");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Überall abmelden (alle Sitzungen ungültig) */
export async function signOutEverywhereAction(): Promise<ActionResult> {
  try {
    const { user } = await requireUser("/konto");
    await db.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/**
 * Konto löschen: Tickets, Nachrichten, Anträge und Anhänge der Person werden
 * gelöscht. Eingetragene Strafen bleiben (berechtigtes Interesse, Bezug nur über
 * die Discord-ID). Während einer laufenden Sperrfrist ist die Löschung gesperrt,
 * damit sie nicht umgangen wird.
 */
export async function deleteAccountAction(confirmText: string): Promise<ActionResult> {
  try {
    const { user } = await requireUser("/konto");
    if (confirmText.trim().toUpperCase() !== "LÖSCHEN") throw new UserError("Bitte tippe LÖSCHEN zur Bestätigung.");
    if (user.teamLevel !== "NONE") throw new UserError("Teammitglieder: bitte erst die Team-Rolle abgeben bzw. die Leitung fragen.");
    const cooldown = await db.cooldown.findFirst({ where: { userId: user.id, until: { gt: new Date() } }, orderBy: { until: "desc" } });
    if (cooldown) {
      throw new UserError(
        `Während einer laufenden Sperrfrist (bis ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long" }).format(cooldown.until)}) können wir dein Konto nicht löschen. Danach geht es – oder schreib uns per Ticket.`,
      );
    }
    const tickets = await db.ticket.findMany({ where: { creatorId: user.id }, select: { id: true } });
    const ticketIds = tickets.map((t) => t.id);
    await db.outboxJob.deleteMany({ where: { ticketId: { in: ticketIds } } });
    // Eigene Nachrichten in fremden Vorgängen gibt es für Spieler nicht; Kaskaden löschen den Rest
    await db.user.delete({ where: { id: user.id } });
    await audit("user.delete", { targetType: "user", targetId: user.id, meta: { tickets: ticketIds.length } });
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
