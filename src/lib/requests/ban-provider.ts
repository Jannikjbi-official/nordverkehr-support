/**
 * Schnittstelle zum Bann-System des Servers – VORBEREITET, noch nicht fest eingebaut.
 *
 * Heute: Strafen trägt das Team im Spielerprofil ein (ManualBanProvider), dazu
 * kommt der Grund aus einem Discord-Bann (DiscordBanProvider).
 * Später: TxAdminBanProvider liest Banns aus txAdmin (oder einem anderen
 * Bann-System) und füllt Ban-ID, Grund, Datum und „ausgesprochen von“ beim
 * Entbannungsantrag automatisch aus.
 *
 * Einbau später: Klasse implementieren, in `getBanProviders()` ergänzen,
 * Zugangsdaten als Umgebungsvariablen (z. B. TXADMIN_URL, TXADMIN_TOKEN).
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export interface BanRecord {
  source: "MANUAL" | "DISCORD" | "TXADMIN";
  /** Ban-ID im Quellsystem */
  externalId: string | null;
  reason: string;
  banType: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  issuedByDiscordId: string | null;
  issuedByName: string | null;
  /** Verweis auf den eigenen Datensatz (Sanction), falls vorhanden */
  sanctionId?: string;
}

export interface BanProvider {
  readonly name: string;
  /** Aktive/letzte Banns einer Person */
  findByDiscordId(discordId: string): Promise<BanRecord[]>;
  /** Bann über die Ban-ID finden (z. B. aus der Bann-Nachricht) */
  findByBanId?(banId: string): Promise<BanRecord | null>;
}

/** Vom Team eingetragene Strafen */
export class ManualBanProvider implements BanProvider {
  readonly name = "manual";
  async findByDiscordId(discordId: string) {
    const rows = await db.sanction.findMany({ where: { subjectDiscordId: discordId, kind: "BAN", liftedAt: null }, orderBy: { startsAt: "desc" }, take: 5 });
    return rows.map(toRecord);
  }
  async findByBanId(banId: string) {
    const row = await db.sanction.findFirst({ where: { externalId: banId } });
    return row ? toRecord(row) : null;
  }
}

function toRecord(s: { id: string; source: string; externalId: string | null; reason: string; banType: string | null; startsAt: Date; endsAt: Date | null; issuedByDiscordId: string | null; issuedByName: string | null }): BanRecord {
  return {
    source: s.source as BanRecord["source"],
    externalId: s.externalId,
    reason: s.reason,
    banType: s.banType,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    issuedByDiscordId: s.issuedByDiscordId,
    issuedByName: s.issuedByName,
    sanctionId: s.id,
  };
}

/** Bann vom Discord-Server (Grund aus der Bannliste; wer gebannt hat, liefert Discord hier nicht) */
export class DiscordBanProvider implements BanProvider {
  readonly name = "discord";
  async findByDiscordId(discordId: string) {
    const guildId = env().DISCORD_GUILD_ID;
    if (!guildId || !env().DISCORD_BOT_TOKEN) return [];
    try {
      const { getDiscordApi } = await import("@/lib/discord/client");
      const ban = await getDiscordApi().getBan(guildId, discordId);
      if (!ban) return [];
      return [{ source: "DISCORD" as const, externalId: null, reason: ban.reason ?? "(kein Grund hinterlegt)", banType: null, startsAt: null, endsAt: null, issuedByDiscordId: null, issuedByName: null }];
    } catch {
      return [];
    }
  }
}

/**
 * Platzhalter für txAdmin – absichtlich NICHT aktiv. txAdmin hat keine stabile
 * öffentliche API; geplant ist eine kleine Brücke (Ressource auf dem FiveM-Server
 * oder Lesezugriff auf die txAdmin-Datenbank), die diese Methoden bedient.
 */
export class TxAdminBanProvider implements BanProvider {
  readonly name = "txadmin";
  constructor(private readonly opts: { baseUrl: string; token: string }) {}
  async findByDiscordId(_discordId: string): Promise<BanRecord[]> {
    void this.opts;
    return [];
  }
  async findByBanId(_banId: string): Promise<BanRecord | null> {
    return null;
  }
}

export function getBanProviders(): BanProvider[] {
  return [new ManualBanProvider(), new DiscordBanProvider()];
}

/** Alle bekannten Banns einer Person aus allen Quellen */
export async function lookupBans(discordId: string): Promise<BanRecord[]> {
  const all = await Promise.all(getBanProviders().map((p) => p.findByDiscordId(discordId).catch(() => [])));
  return all.flat();
}

/** Ban-ID aus dem Antrag einem eingetragenen Bann zuordnen */
export async function lookupBanById(banId: string): Promise<BanRecord | null> {
  for (const p of getBanProviders()) {
    if (!p.findByBanId) continue;
    const r = await p.findByBanId(banId).catch(() => null);
    if (r) return r;
  }
  return null;
}
