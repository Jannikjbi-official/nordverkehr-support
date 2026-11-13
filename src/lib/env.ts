import { z } from "zod";
import { BEWERBUNG_URL, RULES_URL, hostOf } from "@/lib/public-urls";

const snowflake = z.string().regex(/^\d{15,25}$/);
const optSnowflake = snowflake.optional().or(z.literal("").transform(() => undefined));

/**
 * Serverseitige Umgebungsvariablen. Wird erst beim ersten Zugriff validiert,
 * damit `next build` ohne vollständige .env funktioniert.
 */
const serverSchema = z.object({
  DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().min(16).optional(),
  AUTH_DISCORD_ID: z.string().optional(),
  AUTH_DISCORD_SECRET: z.string().optional(),

  // Discord-Bot "NV Lotse" (derselbe Bot wie im Bewerbungsportal)
  DISCORD_BOT_TOKEN: z.string().optional(),
  DISCORD_PUBLIC_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional(),
  DISCORD_GUILD_ID: snowflake.optional(),
  SUPPORT_ROLE_ID: optSnowflake,
  MODERATION_ROLE_ID: optSnowflake,
  LEITUNG_ROLE_ID: optSnowflake,
  /// Text-Channel für das Ticket-Panel
  DISCORD_TICKET_CHANNEL_ID: optSnowflake,
  /// Log-Channel für neue Tickets/Anträge und Entscheidungen
  DISCORD_LOG_CHANNEL_ID: optSnowflake,
  /// Weiterleitung fremder Interaktionen (Bewerbungsportal). Leer = keine Weiterleitung.
  INTERACTIONS_FORWARD_URL: z.string().url().optional(),
  ROLE_CACHE_TTL_SECONDS: z.coerce.number().int().min(5).max(3600).default(60),
  BAN_CACHE_TTL_SECONDS: z.coerce.number().int().min(30).max(86400).default(300),

  CRON_SECRET: z.string().min(16).optional(),
  TICKET_ID_PREFIX: z.string().regex(/^[A-Z]{1,6}$/).default("NVS"),
  REQUEST_ID_PREFIX: z.string().regex(/^[A-Z]{1,6}$/).default("NVA"),

  // Statusseite
  FIVEM_SERVER_URL: z.string().url().optional(),
  FIVEM_CFX_CODE: z.string().regex(/^[a-z0-9]{4,10}$/i).optional(),
  TEAMSPEAK_HOST: z.string().optional(),
  TEAMSPEAK_PORT: z.coerce.number().int().min(1).max(65535).default(10011),
  TEAMSPEAK_WEBQUERY_URL: z.string().url().optional(),
  TEAMSPEAK_WEBQUERY_KEY: z.string().optional(),

  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_DEFAULT: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_FAST: z.string().default("claude-haiku-5-5"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  // Leere Strings wie "nicht gesetzt" behandeln
  const raw = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== undefined && v !== ""));
  const parsed = serverSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ungültige Umgebungsvariablen:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Öffentliche Werte (dürfen im Client landen). */
export const publicEnv = {
  appUrl: (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
  mainSiteUrl: process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://nordverkehr.xyz",
  bewerbungUrl: BEWERBUNG_URL,
  discordInvite: process.env.NEXT_PUBLIC_DISCORD_INVITE ?? "https://discord.gg/KrfKASTHDp",
  rulesUrl: RULES_URL,
};
export { hostOf };

/** Für Tests: Cache zurücksetzen. */
export function resetEnvCache() {
  cached = null;
}
