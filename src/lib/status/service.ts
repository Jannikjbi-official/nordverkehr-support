import "server-only";
import { Socket } from "node:net";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export type ServiceState = "online" | "offline" | "unknown";

export interface ServiceStatus {
  state: ServiceState;
  players?: number;
  maxPlayers?: number;
  detail?: string;
  checkedAt: string;
}

const CACHE_MS = 60_000;
const TIMEOUT_MS = 3500;

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<unknown>;
}

/** Interpretation der FiveM-Antworten – rein, testbar. */
export function parseFivemDynamic(data: unknown): { players: number; maxPlayers: number } | null {
  const d = data as { clients?: unknown; sv_maxclients?: unknown; Data?: { clients?: unknown; sv_maxclients?: unknown; svMaxclients?: unknown } };
  const src = d?.Data ?? d;
  const players = Number(src?.clients);
  const max = Number((src as { sv_maxclients?: unknown; svMaxclients?: unknown })?.sv_maxclients ?? (src as { svMaxclients?: unknown })?.svMaxclients);
  if (!Number.isFinite(players)) return null;
  return { players, maxPlayers: Number.isFinite(max) ? max : 0 };
}

async function checkFivem(): Promise<ServiceStatus> {
  const e = env();
  const checkedAt = new Date().toISOString();
  if (!e.FIVEM_SERVER_URL && !e.FIVEM_CFX_CODE) return { state: "unknown", detail: "Nicht eingerichtet", checkedAt };
  try {
    if (e.FIVEM_SERVER_URL) {
      const base = e.FIVEM_SERVER_URL.replace(/\/$/, "");
      const dyn = parseFivemDynamic(await fetchJson(`${base}/dynamic.json`));
      if (dyn) return { state: "online", ...dyn, checkedAt };
      const players = (await fetchJson(`${base}/players.json`)) as unknown[];
      return { state: "online", players: Array.isArray(players) ? players.length : 0, checkedAt };
    }
    const data = await fetchJson(`https://servers-frontend.fivem.net/api/servers/single/${e.FIVEM_CFX_CODE}`, { headers: { "User-Agent": "nordverkehr-support" } });
    const parsed = parseFivemDynamic(data);
    return parsed ? { state: "online", ...parsed, checkedAt } : { state: "offline", checkedAt };
  } catch {
    return { state: "offline", checkedAt };
  }
}

function tcpReachable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new Socket();
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(TIMEOUT_MS);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
    s.connect(port, host);
  });
}

async function checkTeamspeak(): Promise<ServiceStatus> {
  const e = env();
  const checkedAt = new Date().toISOString();
  try {
    if (e.TEAMSPEAK_WEBQUERY_URL && e.TEAMSPEAK_WEBQUERY_KEY) {
      const base = e.TEAMSPEAK_WEBQUERY_URL.replace(/\/$/, "");
      const data = (await fetchJson(`${base}/1/serverinfo`, { headers: { "x-api-key": e.TEAMSPEAK_WEBQUERY_KEY } })) as {
        body?: { virtualserver_clientsonline?: string; virtualserver_queryclientsonline?: string; virtualserver_maxclients?: string }[];
      };
      const info = data.body?.[0];
      if (!info) return { state: "offline", checkedAt };
      const players = Number(info.virtualserver_clientsonline ?? 0) - Number(info.virtualserver_queryclientsonline ?? 0);
      return { state: "online", players: Math.max(0, players), maxPlayers: Number(info.virtualserver_maxclients ?? 0), checkedAt };
    }
    if (e.TEAMSPEAK_HOST) {
      return { state: (await tcpReachable(e.TEAMSPEAK_HOST, e.TEAMSPEAK_PORT)) ? "online" : "offline", checkedAt };
    }
    return { state: "unknown", detail: "Nicht eingerichtet", checkedAt };
  } catch {
    return { state: "offline", checkedAt };
  }
}

async function cachedCheck(key: string, fn: () => Promise<ServiceStatus>): Promise<ServiceStatus> {
  const row = await db.statusCache.findUnique({ where: { key } }).catch(() => null);
  if (row && Date.now() - row.fetchedAt.getTime() < CACHE_MS) return row.data as unknown as ServiceStatus;
  const fresh = await fn();
  await db.statusCache
    .upsert({ where: { key }, create: { key, data: fresh as never, fetchedAt: new Date() }, update: { data: fresh as never, fetchedAt: new Date() } })
    .catch(() => {});
  return fresh;
}

export async function getLiveStatus() {
  const [gameserver, teamspeak] = await Promise.all([cachedCheck("fivem", checkFivem), cachedCheck("teamspeak", checkTeamspeak)]);
  return { gameserver, teamspeak };
}

/** Laufende und geplante Meldungen (Probleme, Wartungen) */
export async function getIncidents() {
  const now = new Date();
  const [active, upcoming, recent] = await Promise.all([
    db.statusIncident.findMany({ where: { resolvedAt: null, startsAt: { lte: now } }, orderBy: { startsAt: "desc" } }),
    db.statusIncident.findMany({ where: { resolvedAt: null, startsAt: { gt: now } }, orderBy: { startsAt: "asc" }, take: 10 }),
    db.statusIncident.findMany({ where: { resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) } }, orderBy: { resolvedAt: "desc" }, take: 10 }),
  ]);
  return { active, upcoming, recent };
}
