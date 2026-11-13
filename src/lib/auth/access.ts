/**
 * Rollen- und Bannprüfung gegen den Discord-Server.
 *
 * Regeln:
 *  - Team-Stufe aus den Discord-Rollen: Support < Moderation < Leitung
 *    (SUPPORT_ROLE_ID, MODERATION_ROLE_ID, LEITUNG_ROLE_ID). Die höchste zählt.
 *  - Ergebnis wird kurz gecacht (ROLE_CACHE_TTL_SECONDS, Standard 60 s) und bei
 *    jedem Request mit abgelaufenem Cache neu geprüft.
 *  - Fail closed: Ist Discord nicht erreichbar und der Cache abgelaufen,
 *    gibt es keinen Team-Zugriff.
 *  - Bann vom Discord-Server: eigener Cache (BAN_CACHE_TTL_SECONDS). Wer gebannt
 *    ist, kann sich einloggen, sieht aber nur Anträge mit `allowedWhenBanned`.
 *    Ist der Bann-Status nicht prüfbar, bleibt der letzte bekannte Stand.
 *
 * Die Kernlogik ist rein (Dependencies werden übergeben) und damit testbar.
 */
import type { TeamLevel } from "@prisma/client";
import type { GuildMemberInfo } from "@/lib/discord/client";

export interface RoleConfig {
  guildId?: string;
  supportRoleId?: string;
  moderationRoleId?: string;
  leitungRoleId?: string;
  ttlMs: number;
  banTtlMs: number;
}

export interface AccessState {
  inGuild: boolean;
  teamLevel: TeamLevel;
  roleIds: string[];
  roleCheckedAt: Date | null;
  guildBanned: boolean;
  guildBanReason: string | null;
  banCheckedAt: Date | null;
}

export interface Access extends AccessState {
  isTeam: boolean;
  /** Moderation oder Leitung */
  isMod: boolean;
  /** Leitung (Einstellungen, Antragsarten, Export …) */
  isLead: boolean;
  source: "cache" | "discord" | "error" | "unconfigured";
}

export interface AccessDeps {
  config: RoleConfig;
  now: () => Date;
  fetchMember: (guildId: string, discordId: string) => Promise<GuildMemberInfo | null>;
  /** null = nicht gebannt. Wirft, wenn nicht prüfbar (z. B. fehlendes Recht). */
  fetchBan: (guildId: string, discordId: string) => Promise<{ reason: string | null } | null>;
  persist: (userId: string, state: Partial<AccessState>) => Promise<void>;
}

export interface AccessSubject extends AccessState {
  id: string;
  discordId: string;
}

export const LEVEL_RANK: Record<TeamLevel, number> = { NONE: 0, SUPPORT: 1, MODERATION: 2, LEITUNG: 3 };

export const LEVEL_LABEL: Record<TeamLevel, string> = {
  NONE: "Spieler",
  SUPPORT: "Support",
  MODERATION: "Moderation",
  LEITUNG: "Leitung",
};

export function atLeast(level: TeamLevel, min: TeamLevel) {
  return LEVEL_RANK[level] >= LEVEL_RANK[min];
}

/** Höchste Team-Stufe aus den Rollen. */
export function levelFromRoles(roles: readonly string[], config: Pick<RoleConfig, "supportRoleId" | "moderationRoleId" | "leitungRoleId">): TeamLevel {
  if (config.leitungRoleId && roles.includes(config.leitungRoleId)) return "LEITUNG";
  if (config.moderationRoleId && roles.includes(config.moderationRoleId)) return "MODERATION";
  if (config.supportRoleId && roles.includes(config.supportRoleId)) return "SUPPORT";
  return "NONE";
}

export function isCacheFresh(checkedAt: Date | null, now: Date, ttlMs: number): boolean {
  if (!checkedAt) return false;
  const age = now.getTime() - checkedAt.getTime();
  return age >= 0 && age < ttlMs;
}

/** Discord-Stand ist veraltet (TTL abgelaufen) und sollte neu geholt werden. */
export function needsRefresh(subject: Pick<AccessState, "roleCheckedAt" | "banCheckedAt" | "inGuild">, config: Pick<RoleConfig, "ttlMs" | "banTtlMs">, now: Date) {
  const rolesFresh = isCacheFresh(subject.roleCheckedAt, now, config.ttlMs);
  const banFresh = isCacheFresh(subject.banCheckedAt, now, config.banTtlMs);
  return !(rolesFresh && (banFresh || subject.inGuild));
}

/**
 * Darf ein veralteter Stand noch kurz ausgeliefert werden, während im
 * Hintergrund neu geprüft wird? Nur innerhalb von `staleMs` – danach wird
 * wieder blockierend bei Discord gefragt.
 */
export function canServeStale(subject: Pick<AccessState, "roleCheckedAt" | "banCheckedAt" | "inGuild">, now: Date, staleMs: number) {
  return isCacheFresh(subject.roleCheckedAt, now, staleMs) && (subject.inGuild || isCacheFresh(subject.banCheckedAt, now, staleMs));
}

export function withFlags(state: AccessState, source: Access["source"]): Access {
  return {
    ...state,
    isTeam: atLeast(state.teamLevel, "SUPPORT"),
    isMod: atLeast(state.teamLevel, "MODERATION"),
    isLead: state.teamLevel === "LEITUNG",
    source,
  };
}

export async function resolveAccess(subject: AccessSubject, deps: AccessDeps, opts: { force?: boolean } = {}): Promise<Access> {
  const { config } = deps;
  const now = deps.now();
  const current: AccessState = {
    inGuild: subject.inGuild,
    teamLevel: subject.teamLevel,
    roleIds: subject.roleIds,
    roleCheckedAt: subject.roleCheckedAt,
    guildBanned: subject.guildBanned,
    guildBanReason: subject.guildBanReason,
    banCheckedAt: subject.banCheckedAt,
  };

  if (!config.guildId) {
    return withFlags({ ...current, inGuild: false, teamLevel: "NONE", guildBanned: false }, "unconfigured");
  }

  const rolesFresh = !opts.force && isCacheFresh(subject.roleCheckedAt, now, config.ttlMs);
  const banFresh = !opts.force && isCacheFresh(subject.banCheckedAt, now, config.banTtlMs);
  if (rolesFresh && (banFresh || subject.inGuild)) {
    // Wer auf dem Server ist, kann nicht gebannt sein → kein Bann-Abruf nötig
    return withFlags({ ...current, guildBanned: subject.inGuild ? false : current.guildBanned }, "cache");
  }

  const next: AccessState = { ...current };
  let source: Access["source"] = "discord";

  if (!rolesFresh) {
    let member: GuildMemberInfo | null;
    try {
      member = await deps.fetchMember(config.guildId, subject.discordId);
    } catch {
      // Fail closed – Cache NICHT überschreiben, nächster Request versucht es erneut.
      return withFlags({ ...current, teamLevel: "NONE" }, "error");
    }
    next.inGuild = !!member;
    next.roleIds = member ? [...member.roles] : [];
    next.teamLevel = member ? levelFromRoles(member.roles, config) : "NONE";
    next.roleCheckedAt = now;
  }

  if (next.inGuild) {
    next.guildBanned = false;
    next.guildBanReason = null;
    next.banCheckedAt = now;
  } else if (!banFresh) {
    try {
      const ban = await deps.fetchBan(config.guildId, subject.discordId);
      next.guildBanned = !!ban;
      next.guildBanReason = ban?.reason ?? null;
      next.banCheckedAt = now;
    } catch {
      // Bann nicht prüfbar (Recht fehlt / Discord down): letzten Stand behalten
      source = "error";
    }
  }

  await deps.persist(subject.id, next);
  return withFlags(next, source);
}
