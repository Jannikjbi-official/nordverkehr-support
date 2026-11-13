/**
 * Discord → Web OHNE Dauer-Worker: Nachrichten aus dem privaten Ticket-Thread
 * werden per REST abgeholt (`GET /channels/{thread}/messages?after=…`), und zwar
 *  - sobald jemand das Ticket im Portal öffnet (Spieler oder Team),
 *  - per Knopf „Antwort ins Ticket“ / „Ins Portal übernehmen“ im Thread,
 *  - bei den Hintergrundarbeiten (Cron bzw. gedrosselt bei Seitenaufrufen).
 * Idempotent über SyncedDiscordMessage (_id = Discord-Message-ID). Eigene
 * Spiegel-Nachrichten des Bots werden nie zurückübernommen (keine Echo-Schleife).
 *
 * Braucht im Developer Portal den „Message Content Intent“, sonst liefert
 * Discord leere Texte.
 */
import type { TicketStatus } from "@prisma/client";
import type { DiscordMessageInfo } from "@/lib/discord/client";
import { statusAfterMessage } from "@/lib/tickets/status";

export interface MappedMessage {
  discordMessageId: string;
  kind: "PLAYER" | "TEAM";
  authorDiscordId: string;
  authorName: string;
  body: string;
  createdAt: Date;
  links: string[];
}

/**
 * Rein: Welche Thread-Nachrichten werden übernommen und als was?
 *  - Bots/Webhooks (inkl. unserer Spiegel-Nachrichten) und Systemnachrichten: nie
 *  - Ticket-Ersteller → Spieler; alle anderen im privaten Thread → Team
 */
export function mapThreadMessages(messages: DiscordMessageInfo[], creatorDiscordId: string, alreadySynced: Set<string>): MappedMessage[] {
  const out: MappedMessage[] = [];
  for (const m of messages) {
    if (m.authorIsBot) continue;
    if (m.type !== 0 && m.type !== 19) continue;
    if (alreadySynced.has(m.id)) continue;
    const links = m.attachments.map((a) => a.url);
    const body = m.content.trim();
    if (!body && !links.length) continue;
    out.push({
      discordMessageId: m.id,
      kind: m.authorId === creatorDiscordId ? "PLAYER" : "TEAM",
      authorDiscordId: m.authorId,
      authorName: m.authorName,
      body: body || "(Anhang)",
      createdAt: m.createdAt,
      links,
    });
  }
  return out;
}

/** Rein: Ticket-Felder nach übernommenen Nachrichten (Status-Automatik, Zeiten) */
export function applyToTicket(
  t: { status: TicketStatus; firstResponseAt: Date | null; lastPlayerAt: Date | null; lastTeamAt: Date | null; waitingSince: Date | null },
  msgs: MappedMessage[],
) {
  let { status, firstResponseAt, lastPlayerAt, lastTeamAt, waitingSince } = t;
  let resetWarning = false;
  for (const m of msgs) {
    if (status === "CLOSED") break;
    status = statusAfterMessage(status, m.kind);
    if (m.kind === "TEAM") {
      firstResponseAt ??= m.createdAt;
      lastTeamAt = m.createdAt;
      waitingSince = status === "WAITING_PLAYER" ? m.createdAt : null;
    } else {
      lastPlayerAt = m.createdAt;
      waitingSince = null;
      resetWarning = true;
    }
  }
  return { status, firstResponseAt, lastPlayerAt, lastTeamAt, waitingSince, resetWarning };
}
