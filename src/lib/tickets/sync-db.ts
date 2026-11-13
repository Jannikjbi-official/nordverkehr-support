import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { applyToTicket, mapThreadMessages } from "@/lib/tickets/sync";

const MIN_INTERVAL_MS = 15_000;

/**
 * Thread-Nachrichten eines Tickets ins Portal holen. Gedrosselt (15 s pro Ticket),
 * mit Zeitlimit – blockiert eine Seite nie lange. Gibt die Zahl neuer Nachrichten zurück.
 */
export async function syncTicketFromDiscord(ticketId: string, opts: { force?: boolean; timeoutMs?: number } = {}): Promise<number> {
  if (!env().DISCORD_BOT_TOKEN) return 0;
  const t = await db.ticket.findUnique({ where: { id: ticketId }, include: { creator: { select: { discordId: true } } } });
  if (!t?.discordThreadId) return 0;
  // Drosselung atomar: nur wer das Zeitfenster „gewinnt“, fragt Discord
  if (!opts.force) {
    const cutoff = new Date(Date.now() - MIN_INTERVAL_MS);
    const won = await db.ticket.updateMany({ where: { id: t.id, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] }, data: { lastSyncAt: new Date() } });
    if (!won.count) return 0;
  } else {
    await db.ticket.update({ where: { id: t.id }, data: { lastSyncAt: new Date() } });
  }

  const run = async () => {
    const { getDiscordApi } = await import("@/lib/discord/client");
    const api = getDiscordApi();
    let after = t.lastSyncedMessageId ?? undefined;
    let imported = 0;
    for (let page = 0; page < 5; page++) {
      const batch = await api.getMessages(t.discordThreadId!, { after, limit: 100 });
      if (!batch.length) break;
      const known = await db.syncedDiscordMessage.findMany({ where: { id: { in: batch.map((b) => b.id) } }, select: { id: true } });
      const mapped = mapThreadMessages(batch, t.creator.discordId, new Set(known.map((k) => k.id)));
      if (mapped.length) {
        const users = await db.user.findMany({ where: { discordId: { in: [...new Set(mapped.map((m) => m.authorDiscordId))] } }, select: { id: true, discordId: true } });
        const userByDiscord = new Map(users.map((u) => [u.discordId, u.id]));
        const fresh = [];
        for (const m of mapped) {
          // Idempotenz: _id ist die Discord-ID → zweiter Versuch scheitert sauber
          const claimed = await db.syncedDiscordMessage.create({ data: { id: m.discordMessageId, ticketId: t.id } }).then(() => true).catch(() => false);
          if (!claimed) continue;
          await db.ticketMessage.create({
            data: {
              ticketId: t.id,
              authorId: userByDiscord.get(m.authorDiscordId) ?? null,
              authorName: m.authorName,
              authorDiscordId: m.authorDiscordId,
              kind: m.kind,
              body: [m.body, ...m.links.map((l) => `🔗 ${l}`)].join("\n").slice(0, 6000),
              source: "DISCORD",
              discordMessageId: m.discordMessageId,
              createdAt: m.createdAt,
            },
          });
          fresh.push(m);
        }
        if (fresh.length) {
          const current = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
          const next = applyToTicket(current, fresh);
          await db.ticket.update({
            where: { id: t.id },
            data: {
              status: next.status,
              firstResponseAt: next.firstResponseAt,
              lastPlayerAt: next.lastPlayerAt,
              lastTeamAt: next.lastTeamAt,
              waitingSince: next.waitingSince,
              ...(next.resetWarning ? { autoCloseWarnedAt: null } : {}),
              // Erste Team-Antwort in Discord: wer antwortet, betreut (falls bekannt)
              ...(!current.claimedById && fresh.some((f) => f.kind === "TEAM" && userByDiscord.get(f.authorDiscordId))
                ? { claimedById: userByDiscord.get(fresh.find((f) => f.kind === "TEAM" && userByDiscord.get(f.authorDiscordId))!.authorDiscordId) }
                : {}),
            },
          });
          if (next.status !== current.status) {
            await db.ticketEvent.create({ data: { ticketId: t.id, actorName: "Discord", type: "status", from: current.status, to: next.status } });
          }
          imported += fresh.length;
        }
      }
      after = batch[batch.length - 1].id;
      await db.ticket.update({ where: { id: t.id }, data: { lastSyncedMessageId: after } });
      if (batch.length < 100) break;
    }
    return imported;
  };

  const timeout = opts.timeoutMs ?? 2500;
  try {
    return await Promise.race([run(), new Promise<number>((resolve) => setTimeout(() => resolve(0), timeout))]);
  } catch (e) {
    console.warn("[sync] Thread konnte nicht gelesen werden", t.publicId, (e as Error).message);
    return 0;
  }
}
