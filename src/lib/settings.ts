/**
 * Einstellungen in der Datenbank (Admin-Bereich), mit Standardwerten.
 * Kurz im Prozess gecacht; Speichern leert den Cache.
 */
import { z } from "zod";
import { db } from "@/lib/db";

export const SETTINGS_SCHEMA = z.object({
  // Tickets
  "tickets.maxOpen": z.number().int().min(1).max(20),
  "tickets.autoCloseDays": z.number().int().min(1).max(60),
  "tickets.reminderHours": z.number().int().min(1).max(168),
  "tickets.resolvedCloseDays": z.number().int().min(0).max(60),
  "tickets.dmOnReply": z.boolean(),
  // Anträge
  "requests.archiveDays": z.number().int().min(1).max(365),
  "requests.logDecisions": z.boolean(),
  // Löschfristen
  "retention.ticketMonths": z.number().int().min(1).max(60),
  "retention.requestMonths": z.number().int().min(1).max(60),
  "retention.attachmentDays": z.number().int().min(7).max(730),
  "retention.searchDays": z.number().int().min(7).max(365),
  "retention.auditMonths": z.number().int().min(6).max(60),
  // KI
  "ai.enabled": z.boolean(),
  "ai.model": z.string().min(3),
  "ai.fastModel": z.string().min(3),
  "ai.monthlyBudgetUsd": z.number().min(0).max(1000),
  "ai.requestsPerHour": z.number().int().min(1).max(500),
  "ai.tokensPerUserPerDay": z.number().int().min(1000).max(5_000_000),
  "ai.maxInputChars": z.number().int().min(1000).max(100_000),
  // Datenschutz
  "privacy.version": z.number().int().min(1),
});

export type Settings = z.infer<typeof SETTINGS_SCHEMA>;
export type SettingKey = keyof Settings;

export const DEFAULT_SETTINGS: Settings = {
  "tickets.maxOpen": 3,
  "tickets.autoCloseDays": 5,
  "tickets.reminderHours": 24,
  "tickets.resolvedCloseDays": 3,
  "tickets.dmOnReply": true,
  "requests.archiveDays": 14,
  "requests.logDecisions": true,
  "retention.ticketMonths": 12,
  "retention.requestMonths": 24,
  "retention.attachmentDays": 90,
  "retention.searchDays": 90,
  "retention.auditMonths": 24,
  "ai.enabled": false,
  "ai.model": process.env.AI_MODEL_DEFAULT || "claude-sonnet-5-5",
  "ai.fastModel": process.env.AI_MODEL_FAST || "claude-haiku-5-5",
  "ai.monthlyBudgetUsd": 10,
  "ai.requestsPerHour": 30,
  "ai.tokensPerUserPerDay": 200_000,
  "ai.maxInputChars": 20_000,
  "privacy.version": 1,
};

export const SETTING_LABELS: Record<SettingKey, { label: string; help?: string; group: string }> = {
  "tickets.maxOpen": { label: "Max. offene Tickets pro Spieler", group: "Tickets" },
  "tickets.autoCloseDays": { label: "Auto-Schließen nach … Tagen ohne Antwort", help: "Gilt im Status „wartet auf Spieler“.", group: "Tickets" },
  "tickets.reminderHours": { label: "Erinnerung … Stunden vorher", group: "Tickets" },
  "tickets.resolvedCloseDays": { label: "„Gelöst“ wird nach … Tagen geschlossen", help: "0 = sofort beim nächsten Durchlauf.", group: "Tickets" },
  "tickets.dmOnReply": { label: "DM an Spieler bei Team-Antwort", help: "Spieler können DMs zusätzlich selbst abschalten.", group: "Tickets" },
  "requests.archiveDays": { label: "Entschiedene Anträge archivieren nach … Tagen", group: "Anträge" },
  "requests.logDecisions": { label: "Entscheidungen im Discord-Log posten", group: "Anträge" },
  "retention.ticketMonths": { label: "Tickets löschen … Monate nach dem Schließen", group: "Löschfristen" },
  "retention.requestMonths": { label: "Anträge löschen … Monate nach der Entscheidung", group: "Löschfristen" },
  "retention.attachmentDays": { label: "Bild-Anhänge löschen nach … Tagen", group: "Löschfristen" },
  "retention.searchDays": { label: "Suchbegriffe ohne Treffer löschen nach … Tagen", group: "Löschfristen" },
  "retention.auditMonths": { label: "Audit-Log löschen nach … Monaten", group: "Löschfristen" },
  "ai.enabled": { label: "KI-Entwürfe aktiv", group: "KI" },
  "ai.model": { label: "Modell (Zusammenfassung, Entwürfe)", group: "KI" },
  "ai.fastModel": { label: "Schnelles Modell (Einordnung)", group: "KI" },
  "ai.monthlyBudgetUsd": { label: "Monatsbudget (USD)", group: "KI" },
  "ai.requestsPerHour": { label: "Anfragen pro Person und Stunde", group: "KI" },
  "ai.tokensPerUserPerDay": { label: "Tokens pro Person und Tag", group: "KI" },
  "ai.maxInputChars": { label: "Max. Zeichen Eingabe pro Anfrage", group: "KI" },
  "privacy.version": { label: "Version des Datenschutz-Hinweises", help: "Erhöhen = alle müssen den Hinweis neu bestätigen.", group: "Datenschutz" },
};

let cache: { at: number; value: Settings } | null = null;
const TTL_MS = 30_000;

export async function getSettings(): Promise<Settings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await db.setting.findMany();
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue;
    const field = SETTINGS_SCHEMA.shape[r.key as SettingKey];
    const parsed = field.safeParse(r.value);
    if (parsed.success) merged[r.key] = parsed.data;
  }
  const value = merged as Settings;
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<Settings>) {
  const parsed = SETTINGS_SCHEMA.partial().parse(patch);
  for (const [key, value] of Object.entries(parsed)) {
    await db.setting.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
  }
  cache = null;
}

export function resetSettingsCache() {
  cache = null;
}
