/**
 * Hintergrundarbeiten OHNE Dauer-Worker:
 *  - Outbox zustellen (Wiederholungen)
 *  - fehlende Discord-Threads anlegen, Thread-Nachrichten abholen
 *  - Erinnerungen und Auto-Close, gelöste Tickets schließen
 *  - entschiedene Anträge archivieren, Löschfristen (1×/Tag)
 *
 * Ausgelöst durch den Vercel-Cron UND gedrosselt durch normale Seitenaufrufe
 * (höchstens alle 5 Minuten, über eine Sperre in der DB – mehrere Instanzen
 * arbeiten nie gleichzeitig).
 */
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { releaseStuckJobs, runOutbox } from "@/lib/discord/outbox-db";
import { enqueue } from "@/lib/discord/outbox-db";
import { isTestDiscordId } from "@/lib/discord/outbox";
import { buildThreadNotice, buildTicketNoticeDm } from "@/lib/discord/messages";
import { autoCloseAction } from "@/lib/tickets/autoclose";

/** Exklusive Sperre: true, wenn wir sie bekommen haben */
export async function acquireLease(key: string, ms: number): Promise<boolean> {
  const now = new Date();
  const until = new Date(now.getTime() + ms);
  const r = await db.lease.updateMany({ where: { key, until: { lt: now } }, data: { until } });
  if (r.count) return true;
  try {
    await db.lease.create({ data: { key, until } });
    return true;
  } catch {
    return false; // existiert und ist noch gültig
  }
}

let lastLocalCheck = 0;

/** Bei Seitenaufrufen: höchstens alle 5 Minuten (pro Instanz zusätzlich 60 s Ruhe) */
export async function scheduleHousekeeping() {
  if (Date.now() - lastLocalCheck < 60_000) return;
  lastLocalCheck = Date.now();
  if (!(await acquireLease("housekeeping", 5 * 60_000))) return;
  const { after } = await import("next/server");
  after(() => runHousekeeping({ budgetMs: 20_000 }).catch((e) => console.error("[housekeeping]", e)));
}

export async function runHousekeeping(opts: { budgetMs?: number; withRetention?: boolean } = {}) {
  const end = Date.now() + (opts.budgetMs ?? 50_000);
  const left = () => end - Date.now();
  const report: Record<string, number> = {};
  const settings = await getSettings();

  report.released = await releaseStuckJobs(5);
  report.outbox = await runOutbox({ limit: 30 });

  // Fehlende Threads (z. B. Discord kurz nicht erreichbar)
  if (left() > 5000 && settings["tickets.discordEnabled"]) {
    const { ensureDiscordThread } = await import("@/lib/tickets/service");
    const missing = await db.ticket.findMany({
      where: { discordThreadId: null, discordChannelId: null, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PLAYER"] }, sensitivity: { not: "TEAM_COMPLAINT" }, isTest: false, createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } },
      select: { id: true },
      take: 5,
    });
    let n = 0;
    for (const t of missing) if (await ensureDiscordThread(t.id)) n++;
    report.threads = n;
  }

  // Discord → Web: aktive Tickets mit Thread, am längsten nicht abgeglichen zuerst
  if (left() > 5000) {
    const { syncTicketFromDiscord } = await import("@/lib/tickets/sync-db");
    const active = await db.ticket.findMany({
      where: { discordThreadId: { not: null }, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_PLAYER", "RESOLVED"] } },
      orderBy: { lastSyncAt: "asc" },
      select: { id: true },
      take: 15,
    });
    let n = 0;
    for (const t of active) {
      if (left() < 4000) break;
      n += await syncTicketFromDiscord(t.id, { timeoutMs: 3000 });
    }
    report.synced = n;
  }

  // Erinnerungen und Auto-Close
  if (left() > 3000) {
    const { closeTicket } = await import("@/lib/tickets/service");
    const { syncTicketFromDiscord } = await import("@/lib/tickets/sync-db");
    const candidates = await db.ticket.findMany({ where: { status: { in: ["WAITING_PLAYER", "RESOLVED"] } }, include: { creator: true }, take: 100 });
    const s = { autoCloseDays: settings["tickets.autoCloseDays"], reminderHours: settings["tickets.reminderHours"], resolvedCloseDays: settings["tickets.resolvedCloseDays"] };
    let reminded = 0;
    let closed = 0;
    for (const t of candidates) {
      if (left() < 2000) break;
      let action = autoCloseAction(t, s);
      if (!action) continue;
      if (action === "close" && t.discordThreadId) {
        // Vor dem Schließen: hat der Spieler in Discord geantwortet?
        await syncTicketFromDiscord(t.id, { force: true, timeoutMs: 3000 });
        const fresh = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
        action = autoCloseAction(fresh, s);
        if (action !== "close") continue;
      }
      if (action === "remind") {
        const won = await db.ticket.updateMany({ where: { id: t.id, autoCloseWarnedAt: null, status: "WAITING_PLAYER" }, data: { autoCloseWarnedAt: new Date() } });
        if (!won.count) continue;
        const text = `Wir haben noch keine Antwort von dir. Wenn wir in ${s.reminderHours} Stunden nichts hören, schließen wir das Ticket automatisch.`;
        if (!t.creator.dmOptOut && !isTestDiscordId(t.creator.discordId)) {
          await enqueue({ type: "DM", discordUserId: t.creator.discordId, purpose: "ticket_reminder", message: buildTicketNoticeDm({ publicId: t.publicId, title: "Kurze Erinnerung", body: text, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/tickets/${t.id}` }) });
        }
        if (t.discordThreadId) await enqueue({ type: "THREAD_MESSAGE", threadId: t.discordThreadId, message: buildThreadNotice(`⏰ ${text}`) }, { ticketId: t.id });
        await db.ticketMessage.create({ data: { ticketId: t.id, authorName: "System", kind: "SYSTEM", body: `Erinnerung: ${text}` } });
        reminded++;
      } else {
        await closeTicket({ ticketId: t.id, actor: null, reason: action === "close" ? `Keine Antwort seit ${s.autoCloseDays} Tagen` : "Als gelöst markiert" });
        closed++;
      }
    }
    report.reminded = reminded;
    report.autoClosed = closed;
  }

  // Entschiedene Anträge archivieren
  const archiveBefore = new Date(Date.now() - settings["requests.archiveDays"] * 86_400_000);
  report.archived = (await db.request.updateMany({ where: { status: "DECIDED", decidedAt: { lt: archiveBefore } }, data: { status: "ARCHIVED", archivedAt: new Date() } })).count;

  // Löschfristen höchstens einmal am Tag
  if ((opts.withRetention ?? true) && left() > 3000 && (await acquireLease("retention", 23 * 3600_000))) {
    const { runRetention } = await import("@/lib/retention");
    Object.assign(report, await runRetention());
  }

  report.outboxAfter = await runOutbox({ limit: 30 });
  return report;
}
