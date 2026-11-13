import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const AUDIT_LABELS = {
  "auth.login": "Login",
  "ticket.create": "Ticket erstellt",
  "ticket.reply": "Ticket-Antwort (Team)",
  "ticket.note": "Interne Notiz",
  "ticket.status": "Ticket-Status geändert",
  "ticket.claim": "Ticket übernommen",
  "ticket.release": "Ticket freigegeben",
  "ticket.transfer": "Ticket weitergegeben",
  "ticket.priority": "Priorität geändert",
  "ticket.tags": "Tags geändert",
  "ticket.sensitivity": "Sichtbarkeit geändert",
  "ticket.view": "Sensibles Ticket angesehen",
  "ticket.delete": "Ticket gelöscht",
  "request.submit": "Antrag eingereicht",
  "request.status": "Antrag-Status geändert",
  "request.message": "Rückfrage gesendet",
  "request.comment": "Interner Kommentar",
  "request.vote": "Abgestimmt",
  "request.propose": "Entscheidung vorgeschlagen",
  "request.approve": "Entscheidung bestätigt (Vier-Augen)",
  "request.decide": "Antrag entschieden",
  "request.withdraw_proposal": "Vorschlag zurückgezogen",
  "request.view": "Sensiblen Antrag angesehen",
  "request_type.update": "Antragsart bearbeitet",
  "request_type.create": "Antragsart erstellt",
  "article.create": "Artikel erstellt",
  "article.update": "Artikel bearbeitet",
  "article.publish": "Artikel veröffentlicht",
  "article.delete": "Artikel gelöscht",
  "incident.create": "Status-Meldung erstellt",
  "incident.update": "Status-Meldung aktualisiert",
  "incident.delete": "Status-Meldung gelöscht",
  "template.create": "Baustein erstellt",
  "template.update": "Baustein bearbeitet",
  "template.delete": "Baustein gelöscht",
  "player.note": "Notiz zur Person",
  "sanction.create": "Strafe eingetragen",
  "sanction.lift": "Strafe aufgehoben",
  "settings.update": "Einstellungen",
  "discord.setup": "Discord eingerichtet",
  "ai.request": "KI-Entwurf",
  "export.csv": "CSV-Export",
  "user.export": "Datenexport (eigene Daten)",
  "user.delete": "Konto gelöscht",
  "retention.cleanup": "Löschfristen",
} as const;

export type AuditAction = keyof typeof AUDIT_LABELS;

export async function audit(
  action: AuditAction,
  opts: { actorId?: string | null; targetType?: string; targetId?: string; meta?: Prisma.InputJsonValue } = {},
) {
  try {
    await db.auditLog.create({
      data: { action, actorId: opts.actorId ?? null, targetType: opts.targetType, targetId: opts.targetId, meta: opts.meta },
    });
  } catch (err) {
    // Audit darf nie die eigentliche Aktion abbrechen – aber laut loggen
    console.error("[audit] Schreiben fehlgeschlagen", action, err);
  }
}
