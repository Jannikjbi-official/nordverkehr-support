import { db } from "@/lib/db";
import { categoryLabel, displayFields } from "@/lib/tickets/categories";
import { TICKET_STATUS_LABEL } from "@/lib/tickets/status";

const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(d);

export interface TranscriptInput {
  publicId: string;
  subject: string;
  category: string;
  fields: unknown;
  status: string;
  createdAt: Date;
  closedAt?: Date | null;
  messages: { authorName: string; kind: string; body: string; source: string; createdAt: Date; links: string[] }[];
}

/**
 * Transkript als Markdown – ohne interne Notizen (für Spieler und Team gleich).
 * Rein, damit testbar.
 */
export function renderTranscript(t: TranscriptInput): string {
  const lines = [
    `# Transkript ${t.publicId}`,
    "",
    `**Betreff:** ${t.subject}  `,
    `**Kategorie:** ${categoryLabel(t.category)}  `,
    `**Erstellt:** ${fmt(t.createdAt)}  `,
    t.closedAt ? `**Geschlossen:** ${fmt(t.closedAt)}  ` : `**Status:** ${TICKET_STATUS_LABEL[t.status as keyof typeof TICKET_STATUS_LABEL] ?? t.status}  `,
    "",
  ];
  const fields = displayFields(t.category, t.fields);
  if (fields.length) {
    lines.push("## Angaben", "");
    for (const f of fields) lines.push(`- **${f.label}:** ${f.value}`);
    lines.push("");
  }
  lines.push("## Verlauf", "");
  for (const m of t.messages) {
    if (m.kind === "INTERNAL") continue;
    const who = m.kind === "SYSTEM" ? "System" : `${m.authorName}${m.kind === "TEAM" ? " (Team)" : ""}`;
    lines.push(`**${who}** · ${fmt(m.createdAt)}${m.source === "DISCORD" ? " · via Discord" : ""}`, "");
    lines.push(...m.body.split("\n").map((l) => `> ${l}`), "");
    for (const l of m.links) lines.push(`> 🔗 ${l}`);
    if (m.links.length) lines.push("");
  }
  return lines.join("\n");
}

export async function buildTranscript(ticketId: string): Promise<string> {
  const t = await db.ticket.findUniqueOrThrow({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, kind: true, url: true, fileName: true } } } } },
  });
  return renderTranscript({
    publicId: t.publicId,
    subject: t.subject,
    category: t.category,
    fields: t.fields,
    status: "CLOSED",
    createdAt: t.createdAt,
    closedAt: new Date(),
    messages: t.messages.map((m) => ({
      authorName: m.authorName,
      kind: m.kind,
      body: m.body,
      source: m.source,
      createdAt: m.createdAt,
      links: m.attachments.map((a) => (a.kind === "LINK" ? a.url ?? "" : `Bild: ${a.fileName ?? a.id}`)),
    })),
  });
}
