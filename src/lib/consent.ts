import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";

/** Datenschutz-Hinweis bestätigen (beim ersten Ticket/Antrag bzw. nach neuer Version) */
export async function recordConsent(userId: string, given: boolean, currentVersion: number, userVersion: number | null) {
  if ((userVersion ?? 0) >= currentVersion) return;
  if (!given) throw new UserError("Bitte bestätige den Datenschutz-Hinweis.");
  await db.user.update({ where: { id: userId }, data: { consentVersion: currentVersion, consentAt: new Date() } });
}
