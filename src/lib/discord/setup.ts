/**
 * Einrichtung der Discord-App aus dem Verwaltungsbereich:
 *  - Slash-Befehle registrieren: EINZELN per POST (legt an / überschreibt nur
 *    den gleichnamigen Befehl). NIE `PUT …/commands` – das würde die Befehle des
 *    Bewerbungsportals (/bewerbung, /offen, /claim) löschen.
 *  - Interactions-URL setzen (nur, wenn das Support-Center der Router ist).
 *  - Panel posten.
 */
import { env, publicEnv } from "@/lib/env";
import { SUPPORT_COMMANDS } from "@/lib/discord/interactions";
import { buildPanelMessage } from "@/lib/discord/messages";

const API = "https://discord.com/api/v10";

function headers() {
  const token = env().DISCORD_BOT_TOKEN;
  if (!token) throw new Error("DISCORD_BOT_TOKEN fehlt.");
  return { Authorization: `Bot ${token}`, "Content-Type": "application/json" };
}

export async function getApplication(): Promise<{ id: string; name: string; interactions_endpoint_url?: string | null; flags?: number }> {
  const res = await fetch(`${API}/applications/@me`, { headers: headers(), cache: "no-store" });
  if (!res.ok) throw new Error(`Discord-App nicht lesbar (${res.status}).`);
  return res.json();
}

/** Befehls-Registrierung als reine Liste von Requests – testbar (kein PUT!) */
export function commandRequests(appId: string, guildId: string) {
  return SUPPORT_COMMANDS.map((command) => ({ method: "POST" as const, url: `${API}/applications/${appId}/guilds/${guildId}/commands`, body: command }));
}

export async function registerCommands(): Promise<string[]> {
  const guildId = env().DISCORD_GUILD_ID;
  if (!guildId) throw new Error("DISCORD_GUILD_ID fehlt.");
  const app = await getApplication();
  const done: string[] = [];
  for (const r of commandRequests(app.id, guildId)) {
    const res = await fetch(r.url, { method: r.method, headers: headers(), body: JSON.stringify(r.body) });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(`Discord hat /${r.body.name} abgelehnt (${res.status}): ${err?.message ?? "unbekannt"}. Hat der Bot den Scope „applications.commands“?`);
    }
    done.push(`/${r.body.name}`);
  }
  return done;
}

export const interactionsUrl = () => `${publicEnv.appUrl}/api/discord/interactions`;

/** Interactions-URL der App auf das Support-Center setzen (Discord prüft per PING) */
export async function setInteractionsUrl() {
  if (!/^https:\/\//.test(publicEnv.appUrl)) throw new Error("Geht nur auf der Live-Seite (https).");
  const res = await fetch(`${API}/applications/@me`, { method: "PATCH", headers: headers(), body: JSON.stringify({ interactions_endpoint_url: interactionsUrl() }) });
  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as { message?: string; errors?: unknown } | null;
    throw new Error(`Discord hat die URL abgelehnt (${res.status}): ${err?.message ?? "unbekannt"} ${JSON.stringify(err?.errors ?? "").slice(0, 200)}`);
  }
  return interactionsUrl();
}

export async function postPanel(channelId: string) {
  const { getDiscordApi } = await import("@/lib/discord/client");
  return getDiscordApi().postMessage(channelId, buildPanelMessage({ helpUrl: publicEnv.appUrl, requestsUrl: `${publicEnv.appUrl}/antraege` }));
}

/** Kurzer Gesundheitscheck für die Verwaltung */
export async function diagnose() {
  const e = env();
  const checks: { label: string; ok: boolean; detail: string }[] = [];
  try {
    const app = await getApplication();
    checks.push({ label: "Bot-Token", ok: true, detail: `App „${app.name}“` });
    const url = app.interactions_endpoint_url ?? "";
    checks.push({
      label: "Interactions-URL",
      ok: url === interactionsUrl(),
      detail: url ? (url === interactionsUrl() ? "zeigt auf das Support-Center (Router)" : `zeigt auf ${url} – Support-Knöpfe gehen dann nicht`) : "nicht gesetzt",
    });
    // Message Content Intent: Flags 1<<18 (GATEWAY_MESSAGE_CONTENT) oder 1<<19 (…_LIMITED)
    const flags = app.flags ?? 0;
    const content = (flags & (1 << 18)) !== 0 || (flags & (1 << 19)) !== 0;
    checks.push({ label: "Message Content Intent", ok: content, detail: content ? "an – Thread-Nachrichten werden mit Text übernommen" : "aus – Texte aus Discord-Threads kommen leer an" });
  } catch (err) {
    checks.push({ label: "Bot-Token", ok: false, detail: (err as Error).message });
  }
  checks.push({ label: "Server-ID", ok: !!e.DISCORD_GUILD_ID, detail: e.DISCORD_GUILD_ID ?? "fehlt" });
  checks.push({ label: "Rollen", ok: !!(e.SUPPORT_ROLE_ID && e.MODERATION_ROLE_ID && e.LEITUNG_ROLE_ID), detail: [e.SUPPORT_ROLE_ID ? "Support ✓" : "Support fehlt", e.MODERATION_ROLE_ID ? "Moderation ✓" : "Moderation fehlt", e.LEITUNG_ROLE_ID ? "Leitung ✓" : "Leitung fehlt"].join(" · ") });
  checks.push({ label: "Ticket-Channel", ok: !!e.DISCORD_TICKET_CHANNEL_ID, detail: e.DISCORD_TICKET_CHANNEL_ID ?? "fehlt – Tickets laufen dann nur im Portal" });
  checks.push({ label: "Log-Channel", ok: !!e.DISCORD_LOG_CHANNEL_ID, detail: e.DISCORD_LOG_CHANNEL_ID ?? "optional, nicht gesetzt" });
  checks.push({ label: "Weiterleitung Bewerbungsportal", ok: !!e.INTERACTIONS_FORWARD_URL, detail: e.INTERACTIONS_FORWARD_URL ?? "aus – Knöpfe des Bewerbungsportals würden nicht beantwortet" });
  return checks;
}
