/**
 * Discord-Nachrichten des Support-Centers (Components V2, Nordverkehr-Design).
 * Rein – keine Datenbank, damit testbar.
 */
import type { RESTPostAPIChannelMessageJSONBody } from "discord-api-types/v10";
import {
  BODY_LIMIT,
  BRAND_COLOR,
  LOGO_URL,
  NEUTRAL_COLOR,
  WARN_COLOR,
  buttonRow,
  discordTime,
  linkButtons,
  section,
  separator,
  text,
  truncate,
  v2Message,
} from "@/lib/messages/embed";
import { ids } from "@/lib/discord/interactions";

/** Markdown/Erwähnungen aus Nutzertext entschärfen (kein @everyone, keine Pings) */
export const escapeMd = (s: string) => s.replace(/([\\*_~`|>#[\]])/g, "\\$1").replace(/@(everyone|here)/gi, "@\u200b$1");
const noPings = (s: string) => s.replace(/@(everyone|here)/gi, "@\u200b$1").replace(/<@[!&]?(\d+)>/g, "@$1");

/** DM an den Spieler bei einer Team-Antwort */
export function buildTicketReplyDm(input: { publicId: string; subject: string; authorName: string; body: string; url: string }): RESTPostAPIChannelMessageJSONBody {
  return v2Message(BRAND_COLOR, [
    section([`-# NORDVERKEHR // SUPPORT`, `## Neue Antwort auf ${input.publicId}`, `**${escapeMd(truncate(input.subject, 150))}**`], LOGO_URL),
    separator(),
    text(`**${escapeMd(input.authorName)}** schreibt:\n${truncate(noPings(input.body), BODY_LIMIT - 400)}`),
    separator(false),
    text(`-# ${discordTime(new Date())} · DMs abschalten: Portal → Konto`),
    linkButtons([{ label: "Im Portal antworten", url: input.url }]),
  ]);
}

/** DM: Status geändert / Erinnerung / geschlossen */
export function buildTicketNoticeDm(input: { publicId: string; title: string; body: string; url: string; rate?: { ticketId: string } | null }): RESTPostAPIChannelMessageJSONBody {
  return v2Message(input.rate ? BRAND_COLOR : NEUTRAL_COLOR, [
    section([`-# NORDVERKEHR // SUPPORT`, `## ${escapeMd(truncate(input.title, 150))}`, `Ticket ${input.publicId}`], LOGO_URL),
    separator(),
    text(truncate(input.body, 1500)),
    input.rate
      ? buttonRow([1, 2, 3, 4, 5].map((n) => ({ label: "★".repeat(n), customId: ids.rate(input.rate!.ticketId, n) })))
      : null,
    linkButtons([{ label: "Ticket öffnen", url: input.url }]),
  ]);
}

/** DM bei Anträgen (Rückfrage, Entscheidung) */
export function buildRequestDm(input: { publicId: string; typeTitle: string; title: string; body: string; url: string }): RESTPostAPIChannelMessageJSONBody {
  return v2Message(BRAND_COLOR, [
    section([`-# NORDVERKEHR // ANTRÄGE`, `## ${escapeMd(truncate(input.title, 150))}`, `${escapeMd(input.typeTitle)} · ${input.publicId}`], LOGO_URL),
    separator(),
    text(truncate(noPings(input.body), BODY_LIMIT - 300)),
    separator(false),
    text(`-# ${discordTime(new Date())} · Alles Weitere im Portal`),
    linkButtons([{ label: "Antrag öffnen", url: input.url }]),
  ]);
}

/** Log-Channel: neues Ticket, neuer Antrag, Entscheidung */
export function buildLogLine(line: string, opts: { url?: string | null; tone?: "default" | "warn" | "brand" } = {}): RESTPostAPIChannelMessageJSONBody {
  const color = opts.tone === "warn" ? WARN_COLOR : opts.tone === "brand" ? BRAND_COLOR : NEUTRAL_COLOR;
  return v2Message(color, [text(truncate(line, 1800)), text(`-# ${discordTime(new Date())}`), linkButtons([{ label: "Öffnen", url: opts.url }])]);
}

/** Support-Panel im Ticket-Channel */
export function buildPanelMessage(input: { helpUrl: string; requestsUrl: string }): RESTPostAPIChannelMessageJSONBody {
  return v2Message(BRAND_COLOR, [
    section(
      [
        `-# NORDVERKEHR // SUPPORT`,
        `## Wobei können wir *helfen?*`,
        "Technikproblem, Spielerbeschwerde, Bug oder Frage zum Regelwerk? Mach ein Ticket auf – kurz ausfüllen, der Rest läuft im Portal.",
      ],
      LOGO_URL,
    ),
    separator(),
    text(
      "**Ticket** – für Probleme und Fragen. Antworten vom Team bekommst du per DM, den Verlauf im Portal.\n**Antrag** – für formelle Sachen mit Entscheidung: Entbannung, Einspruch, Namensänderung, Rückerstattung … Ausgefüllt wird immer im Portal.\n\n-# Beschwerden über ein Teammitglied bitte nur im Portal – die landen direkt bei der Leitung.",
    ),
    buttonRow(
      [
        { label: "Ticket erstellen", customId: ids.panelTicket, emoji: "🎫", style: 1 },
        { label: "Antrag stellen", customId: ids.panelRequest, emoji: "📄" },
      ],
      { label: "Hilfe-Center", url: input.helpUrl },
    ),
  ]);
}
