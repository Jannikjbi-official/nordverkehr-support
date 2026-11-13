/**
 * Push-Signale über Pusher Channels (oder kompatibel, z. B. Soketi), damit neue
 * Nachrichten sofort erscheinen – Vercel-Funktionen können keine dauerhaften
 * Verbindungen halten. Ohne Konfiguration passiert hier nichts; die Seiten
 * fragen dann regelmäßig nach (siehe src/lib/live.ts).
 *
 * Signale werden pro Request gesammelt und NACH der Antwort (after) in einem
 * Rutsch verschickt – also erst, wenn die Änderung gespeichert ist.
 */
import type Pusher from "pusher";
import {
  LIVE_EVENT,
  requestChannel,
  requestTeamChannel,
  teamRequestsChannel,
  teamTicketsChannel,
  ticketChannel,
  ticketTeamChannel,
} from "@/lib/live-channels";

export function realtimeConfig(env: Record<string, string | undefined> = process.env) {
  const appId = env.PUSHER_APP_ID?.trim();
  const secret = env.PUSHER_SECRET?.trim();
  const key = env.NEXT_PUBLIC_PUSHER_KEY?.trim();
  const cluster = env.NEXT_PUBLIC_PUSHER_CLUSTER?.trim() || "eu";
  if (!appId || !secret || !key) return null;
  // Selbst gehostet (z. B. Soketi): PUSHER_HOST / PUSHER_PORT / PUSHER_USE_TLS
  return { appId, secret, key, cluster, host: env.PUSHER_HOST?.trim() || undefined, port: env.PUSHER_PORT?.trim() || undefined, useTLS: env.PUSHER_USE_TLS !== "false" };
}

let client: Pusher | null = null;
async function getClient() {
  const cfg = realtimeConfig();
  if (!cfg) return null;
  if (!client) {
    const { default: PusherServer } = await import("pusher");
    client = new PusherServer({
      appId: cfg.appId,
      key: cfg.key,
      secret: cfg.secret,
      cluster: cfg.cluster,
      useTLS: cfg.useTLS,
      ...(cfg.host ? { host: cfg.host } : {}),
      ...(cfg.port ? { port: cfg.port } : {}),
    });
  }
  return client;
}

const pending = new Set<string>();
let scheduled = false;

async function flush() {
  scheduled = false;
  const channels = [...pending];
  pending.clear();
  if (!channels.length) return;
  const c = await getClient();
  if (!c) return;
  // Pusher: höchstens 100 Kanäle pro Aufruf
  for (let i = 0; i < channels.length; i += 100) {
    await c.trigger(channels.slice(i, i + 100), LIVE_EVENT, {}).catch((e: unknown) => console.warn("[realtime] Signal fehlgeschlagen", (e as Error).message));
  }
}

/** Kanäle als „geändert“ markieren – wird gesammelt verschickt. */
export function notifyChanged(channels: string[]) {
  if (!channels.length || !realtimeConfig()) return;
  for (const ch of channels) pending.add(ch);
  if (scheduled) return;
  scheduled = true;
  import("next/server")
    .then(({ after }) => after(flush))
    .catch(() => setTimeout(() => void flush(), 50)); // außerhalb eines Requests (Cron, Skripte)
}

// ─── Welche Änderung betrifft welche Kanäle? ──────────────────

type Row = Record<string, unknown> | null | undefined;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** ID aus Ergebnis, Eingabe (`ticketId` oder `ticket: { connect: { id } }`) oder `where` */
function pick(field: string, relation: string, result: Row, data: Row, where: Row): string | undefined {
  const connect = (data?.[relation] as Row)?.connect as Row;
  return str(result?.[field]) ?? str(data?.[field]) ?? str(connect?.id) ?? str(where?.[field]);
}

const MUTATIONS = new Set(["create", "update", "upsert", "delete", "updateMany", "createMany"]);

/**
 * Leitet aus einer Prisma-Schreiboperation die betroffenen Kanäle ab.
 * Rein und testbar; wird von der Prisma-Extension in db.ts aufgerufen.
 */
export function channelsForMutation(model: string | undefined, operation: string, args: Record<string, unknown> | undefined, result: unknown): string[] {
  if (!model || !MUTATIONS.has(operation)) return [];
  const data = (args?.data ?? args?.create) as Row;
  const where = args?.where as Row;
  const row = (result && typeof result === "object" && !Array.isArray(result) ? result : null) as Row;
  const whereId = str(where?.id) ?? ((where?.id as Row)?.in as string[] | undefined)?.[0];

  switch (model) {
    case "Ticket": {
      const id = str(row?.id) ?? whereId;
      return id ? [ticketChannel(id), ticketTeamChannel(id), teamTicketsChannel] : [teamTicketsChannel];
    }
    case "TicketMessage": {
      if (operation === "updateMany" || operation === "createMany") return [];
      const id = pick("ticketId", "ticket", row, data, where);
      if (!id) return [];
      const internal = (str(row?.kind) ?? str(data?.kind)) === "INTERNAL";
      return internal ? [ticketTeamChannel(id)] : [ticketChannel(id), ticketTeamChannel(id), teamTicketsChannel];
    }
    case "TicketEvent": {
      const id = pick("ticketId", "ticket", row, data, where);
      return id ? [ticketTeamChannel(id)] : [];
    }
    case "Request": {
      const id = str(row?.id) ?? whereId;
      return id ? [requestChannel(id), requestTeamChannel(id), teamRequestsChannel] : [teamRequestsChannel];
    }
    case "RequestMessage": {
      if (operation === "updateMany" || operation === "createMany") return [];
      const id = pick("requestId", "request", row, data, where);
      if (!id) return [];
      const internal = (str(row?.kind) ?? str(data?.kind)) === "INTERNAL";
      return internal ? [requestTeamChannel(id)] : [requestChannel(id), requestTeamChannel(id), teamRequestsChannel];
    }
    case "RequestComment":
    case "RequestVote":
    case "RequestDecision": {
      const id = pick("requestId", "request", row, data, where);
      return id ? [requestTeamChannel(id)] : [];
    }
    default:
      return [];
  }
}
