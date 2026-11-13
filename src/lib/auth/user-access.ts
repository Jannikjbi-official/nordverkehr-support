/**
 * Nutzer- und Rollenauflösung ohne `server-only`, damit auch der Proxy sie
 * importieren kann. Nicht in Client-Komponenten importieren.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canServeStale, needsRefresh, resolveAccess, withFlags, type Access, type AccessDeps } from "@/lib/auth/access";
import type { User } from "@prisma/client";
import { isDevLoginEnabled } from "@/lib/auth/dev";

export type CurrentUser = User;

/** Lädt den eingeloggten Nutzer aus der DB und prüft die Sitzungsversion. */
export async function loadUserFromSession(session: { uid?: string; sv?: number } | null): Promise<CurrentUser | null> {
  if (!session?.uid) return null;
  const user = await db.user.findUnique({ where: { id: session.uid } });
  if (!user) return null;
  if ((session.sv ?? -1) !== user.sessionVersion) return null;
  return user;
}

function accessDeps(): AccessDeps {
  const e = env();
  return {
    config: {
      guildId: e.DISCORD_GUILD_ID,
      supportRoleId: e.SUPPORT_ROLE_ID,
      moderationRoleId: e.MODERATION_ROLE_ID,
      leitungRoleId: e.LEITUNG_ROLE_ID,
      ttlMs: e.ROLE_CACHE_TTL_SECONDS * 1000,
      banTtlMs: e.BAN_CACHE_TTL_SECONDS * 1000,
    },
    now: () => new Date(),
    fetchMember: async (guildId, discordId) => {
      const { getDiscordApi } = await import("@/lib/discord/client");
      return getDiscordApi().getMember(guildId, discordId);
    },
    fetchBan: async (guildId, discordId) => {
      const { getDiscordApi } = await import("@/lib/discord/client");
      return getDiscordApi().getBan(guildId, discordId);
    },
    persist: async (userId, state) => {
      await db.user.update({ where: { id: userId }, data: state });
    },
  };
}

// Parallele Requests desselben Nutzers teilen sich eine Discord-Abfrage
const inflight = new Map<string, Promise<Access>>();

export async function getAccess(user: CurrentUser, opts: { force?: boolean } = {}): Promise<Access> {
  // Lokale Entwicklung ohne Discord-Server bzw. Seed-Nutzer: Stand aus der Datenbank
  if ((isDevLoginEnabled() && !process.env.DISCORD_GUILD_ID) || user.isTest) {
    return withFlags(
      {
        inGuild: user.inGuild,
        teamLevel: user.teamLevel,
        roleIds: user.roleIds,
        roleCheckedAt: new Date(),
        guildBanned: user.guildBanned,
        guildBanReason: user.guildBanReason,
        banCheckedAt: new Date(),
      },
      "cache",
    );
  }
  const deps = accessDeps();
  const now = new Date();
  // Stale-while-revalidate: Ist der Stand nur knapp veraltet, sofort mit dem
  // gespeicherten Stand antworten und Discord im Hintergrund fragen – die Seite
  // wartet dann nicht auf Discord. Der nächste Request hat den frischen Stand.
  if (!opts.force && needsRefresh(user, deps.config, now) && canServeStale(user, now, STALE_MS)) {
    refreshInBackground(user, deps);
    return resolveAccess(user, { ...deps, config: { ...deps.config, ttlMs: STALE_MS, banTtlMs: STALE_MS } });
  }
  return resolveShared(user, deps, opts);
}

/** Wie lange ein veralteter Discord-Stand höchstens noch ausgeliefert wird */
const STALE_MS = 10 * 60_000;

function resolveShared(user: CurrentUser, deps: AccessDeps, opts: { force?: boolean }) {
  const key = `${user.id}:${opts.force ? 1 : 0}`;
  const existing = inflight.get(key);
  if (existing) return existing;
  const p = resolveAccess(user, deps, opts).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

function refreshInBackground(user: CurrentUser, deps: AccessDeps) {
  const run = () => resolveShared(user, deps, {}).catch((e) => console.warn("[access] Hintergrund-Prüfung fehlgeschlagen", e));
  import("next/server")
    .then(({ after }) => after(run))
    .catch(() => void run()); // außerhalb eines Requests: einfach laufen lassen
}
