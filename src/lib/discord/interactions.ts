/**
 * Discord-Interaktionen des Support-Centers (rein, testbar).
 *
 * Alle Knöpfe/Fenster des Supports beginnen mit `nvs:` – das Bewerbungsportal
 * nutzt `nv:`. Der Router (lib/discord/router.ts) entscheidet anhand dieses
 * Präfixes und der Befehlsnamen, wer eine Interaktion bearbeitet.
 *
 *  nvs:panel:ticket               Panel-Knopf „Ticket erstellen“ → Kategorie-Auswahl
 *  nvs:panel:request              Panel-Knopf „Antrag stellen“ → Links ins Portal
 *  nvs:cat                        Auswahlmenü Kategorie → Modal
 *  nvs:new:<kategorie>            Modal abgeschickt → Ticket + privater Thread
 *  nvs:t:claim:<ticketId>         Team: Ticket übernehmen
 *  nvs:t:reply:<ticketId>         „Antwort ins Ticket“ → Modal (Fallback ohne Worker)
 *  nvs:t:replysubmit:<ticketId>   Modal abgeschickt → Nachricht im Portal
 *  nvs:t:sync:<ticketId>          Thread-Nachrichten jetzt ins Portal übernehmen
 *  nvs:t:close:<ticketId>         Schließen (fragt nach)
 *  nvs:t:closeok:<ticketId>       Schließen bestätigt
 *  nvs:t:rate:<ticketId>:<1-5>    Bewertung aus der DM
 */
import { createPublicKey, verify } from "node:crypto";

export const PREFIX = "nvs:";

/** SPKI-Präfix für einen rohen 32-Byte-Ed25519-Schlüssel */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export function verifyDiscordSignature(publicKeyHex: string, signatureHex: string | null, timestamp: string | null, body: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!signatureHex || !timestamp || !/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{128}$/i.test(signatureHex)) return false;
  // Wiederholungsschutz: Zeitstempel höchstens 5 Minuten alt
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  try {
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyHex, "hex")]), format: "der", type: "spki" });
    return verify(null, Buffer.from(timestamp + body), key, Buffer.from(signatureHex, "hex"));
  } catch {
    return false;
  }
}

let cachedKey: string | null = null;

/** Öffentlicher Schlüssel der App: DISCORD_PUBLIC_KEY oder per Bot-Token von Discord geholt. */
export async function getDiscordPublicKey(): Promise<string | null> {
  if (process.env.DISCORD_PUBLIC_KEY) return process.env.DISCORD_PUBLIC_KEY;
  if (cachedKey) return cachedKey;
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) return null;
  const res = await fetch("https://discord.com/api/v10/applications/@me", { headers: { Authorization: `Bot ${token}` }, cache: "no-store" });
  if (!res.ok) return null;
  const app = (await res.json()) as { verify_key?: string };
  cachedKey = app.verify_key ?? null;
  return cachedKey;
}

// ─── Custom-IDs ───────────────────────────────────────────────

export const ids = {
  panelTicket: "nvs:panel:ticket",
  panelRequest: "nvs:panel:request",
  categorySelect: "nvs:cat",
  newTicket: (category: string) => `nvs:new:${category}`,
  claim: (ticketId: string) => `nvs:t:claim:${ticketId}`,
  reply: (ticketId: string) => `nvs:t:reply:${ticketId}`,
  replySubmit: (ticketId: string) => `nvs:t:replysubmit:${ticketId}`,
  sync: (ticketId: string) => `nvs:t:sync:${ticketId}`,
  close: (ticketId: string) => `nvs:t:close:${ticketId}`,
  closeOk: (ticketId: string) => `nvs:t:closeok:${ticketId}`,
  rate: (ticketId: string, stars: number) => `nvs:t:rate:${ticketId}:${stars}`,
};

export type SupportAction =
  | { kind: "panelTicket" }
  | { kind: "panelRequest" }
  | { kind: "categorySelect" }
  | { kind: "newTicket"; category: string }
  | { kind: "claim" | "reply" | "replySubmit" | "sync" | "close" | "closeOk"; ticketId: string }
  | { kind: "rate"; ticketId: string; stars: number };

const ID = "([a-z0-9]{10,40})";

export function parseCustomId(customId: string): SupportAction | null {
  if (!customId.startsWith(PREFIX) || customId.length > 100) return null;
  if (customId === ids.panelTicket) return { kind: "panelTicket" };
  if (customId === ids.panelRequest) return { kind: "panelRequest" };
  if (customId === ids.categorySelect) return { kind: "categorySelect" };
  let m = customId.match(/^nvs:new:([a-z]{2,20})$/);
  if (m) return { kind: "newTicket", category: m[1] };
  m = customId.match(new RegExp(`^nvs:t:rate:${ID}:([1-5])$`, "i"));
  if (m) return { kind: "rate", ticketId: m[1], stars: Number(m[2]) };
  m = customId.match(new RegExp(`^nvs:t:(claim|reply|replysubmit|sync|close|closeok):${ID}$`, "i"));
  if (m) {
    const map = { claim: "claim", reply: "reply", replysubmit: "replySubmit", sync: "sync", close: "close", closeok: "closeOk" } as const;
    return { kind: map[m[1].toLowerCase() as keyof typeof map], ticketId: m[2] };
  }
  return null;
}

// ─── Slash-Befehle (Guild-Befehle; einzeln per POST registriert, NIE Bulk-Overwrite) ──

export const TICKET_COMMAND = {
  name: "ticket",
  type: 1,
  description: "Support-Ticket bei Nordverkehr",
  dm_permission: false,
  options: [
    { type: 1, name: "neu", description: "Neues Ticket erstellen" },
    { type: 1, name: "status", description: "Deine offenen Tickets (nur für dich sichtbar)" },
    {
      type: 1,
      name: "claim",
      description: "Team: Ticket übernehmen (im Ticket-Thread oder mit ID)",
      options: [{ type: 3, name: "id", description: "Ticket-ID, z. B. NVS-2026-0012 oder 12", required: false, max_length: 40 }],
    },
  ],
} as const;

export const REQUEST_COMMAND = {
  name: "antrag",
  type: 1,
  description: "Antrag stellen oder Stand ansehen (Entbannung, Einspruch, Namensänderung …)",
  dm_permission: false,
} as const;

export const PANEL_COMMAND = {
  name: "support-panel",
  type: 1,
  description: "Leitung: Support-Panel mit Knöpfen in diesen Channel posten",
  dm_permission: false,
  default_member_permissions: "32", // Server verwalten – zusätzlich prüfen wir die Leitungs-Rolle
} as const;

export const SUPPORT_COMMANDS = [TICKET_COMMAND, REQUEST_COMMAND, PANEL_COMMAND] as const;
export const SUPPORT_COMMAND_NAMES: readonly string[] = SUPPORT_COMMANDS.map((c) => c.name);

// ─── Antworten ────────────────────────────────────────────────

/** Nur für die klickende Person sichtbar */
export const ephemeral = (content: string, components?: unknown[]) => ({
  type: 4,
  data: { content, flags: 64, allowed_mentions: { parse: [] }, ...(components ? { components } : {}) },
});

/** Antwort verzögern (Typ 5) – Ergebnis später per Webhook */
export const deferredEphemeral = () => ({ type: 5, data: { flags: 64 } });

/** Text aus einem abgeschickten Fenster lesen (klassische Action-Rows und neue Label-Komponenten). */
export function modalValue(data: unknown, field: string): string {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const o = c as { custom_id?: string; value?: string; components?: unknown[]; component?: unknown };
    if (o.custom_id === field && typeof o.value === "string") out.push(o.value);
    o.components?.forEach(walk);
    if (o.component) walk(o.component);
  };
  walk(data);
  return out[0] ?? "";
}

export function textInput(customId: string, label: string, opts: { style?: 1 | 2; required?: boolean; placeholder?: string; max?: number; min?: number; value?: string } = {}) {
  return {
    type: 1,
    components: [
      {
        type: 4,
        custom_id: customId,
        label: label.slice(0, 45),
        style: opts.style ?? 1,
        required: opts.required ?? true,
        ...(opts.placeholder ? { placeholder: opts.placeholder.slice(0, 100) } : {}),
        ...(opts.min ? { min_length: opts.min } : {}),
        max_length: Math.min(opts.max ?? 1000, 4000),
        ...(opts.value ? { value: opts.value } : {}),
      },
    ],
  };
}

export function modal(customId: string, title: string, rows: unknown[]) {
  return { type: 9, data: { custom_id: customId, title: title.slice(0, 45), components: rows.slice(0, 5) } };
}

/** Webhook-Antwort einer verzögerten Interaktion bearbeiten */
export async function editOriginal(applicationId: string, token: string, body: Record<string, unknown>) {
  const res = await fetch(`https://discord.com/api/v10/webhooks/${applicationId}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed_mentions: { parse: [] }, ...body }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) console.warn("[interactions] editOriginal", res.status, await res.text().catch(() => ""));
}
