/**
 * Prisma-Anbindung der Outbox.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getDiscordApi } from "@/lib/discord/client";
import { processJob, type OutboxJobLike, type OutboxPayload, type OutboxStore } from "@/lib/discord/outbox";

export const prismaOutboxStore: OutboxStore = {
  async complete(job, result) {
    await db.outboxJob.update({ where: { id: job.id }, data: { status: "DONE", attempts: { increment: 1 }, result, lastError: null, lockedAt: null } });
    const skipped = result.skipped === "test";
    const p = job.payload as OutboxPayload;
    if (p.type === "DM") {
      const data = skipped ? { deliveryStatus: "NOT_SENT" as const, deliveryError: null } : { deliveryStatus: "SENT" as const, deliveryError: null };
      if (job.ticketMessageId) await db.ticketMessage.updateMany({ where: { id: job.ticketMessageId }, data });
      if (job.requestMessageId) await db.requestMessage.updateMany({ where: { id: job.requestMessageId }, data });
    }
  },
  async reschedule(job, error, runAt) {
    console.warn("[outbox] neuer Versuch geplant", job.type, error);
    await db.outboxJob.update({ where: { id: job.id }, data: { status: "PENDING", attempts: { increment: 1 }, lastError: error, runAt, lockedAt: null } });
  },
  async fail(job, error, { dmClosed }) {
    const status = dmClosed ? "DM_CLOSED" : "FAILED";
    console.warn("[outbox] fehlgeschlagen", job.type, error);
    await db.outboxJob.update({
      where: { id: job.id },
      data: { status: "FAILED", attempts: { increment: 1 }, lastError: error, lockedAt: null, result: { dmClosed: dmClosed ? "true" : "false" } },
    });
    if (job.ticketMessageId) await db.ticketMessage.updateMany({ where: { id: job.ticketMessageId }, data: { deliveryStatus: status, deliveryError: error } });
    if (job.requestMessageId) await db.requestMessage.updateMany({ where: { id: job.requestMessageId }, data: { deliveryStatus: status, deliveryError: error } });
  },
};

export async function enqueue(
  payload: OutboxPayload,
  opts: { ticketMessageId?: string; requestMessageId?: string; ticketId?: string; tx?: Prisma.TransactionClient; runAt?: Date } = {},
) {
  const client = opts.tx ?? db;
  return client.outboxJob.create({
    data: {
      type: payload.type,
      payload: payload as unknown as Prisma.InputJsonValue,
      ticketMessageId: opts.ticketMessageId,
      requestMessageId: opts.requestMessageId,
      ticketId: opts.ticketId,
      ...(opts.runAt ? { runAt: opts.runAt } : {}),
    },
    select: { id: true },
  });
}

const JOB_SELECT = { id: true, type: true, payload: true, attempts: true, maxAttempts: true, ticketMessageId: true, requestMessageId: true, ticketId: true } as const;

/**
 * Holt fällige Jobs exklusiv: bedingtes Update PENDING → PROCESSING ist in
 * der Datenbank atomar, parallele Funktionen verarbeiten einen Job nie doppelt.
 */
async function claim(limit: number, ids?: string[]): Promise<OutboxJobLike[]> {
  const now = new Date();
  const candidates = await db.outboxJob.findMany({
    where: ids?.length ? { id: { in: ids }, status: "PENDING", runAt: { lte: now } } : { status: "PENDING", runAt: { lte: now } },
    orderBy: { runAt: "asc" },
    take: ids?.length ? ids.length : limit,
    select: JOB_SELECT,
  });
  const results = await Promise.all(
    candidates.map((job) =>
      db.outboxJob.updateMany({ where: { id: job.id, status: "PENDING" }, data: { status: "PROCESSING", lockedAt: now } }).then((r) => (r.count === 1 ? job : null)),
    ),
  );
  return results.filter((j) => j !== null) as OutboxJobLike[];
}

/** Hängengebliebene Jobs (Funktion abgebrochen) wieder freigeben. */
export async function releaseStuckJobs(olderThanMinutes = 5) {
  const res = await db.outboxJob.updateMany({
    where: { status: "PROCESSING", lockedAt: { lt: new Date(Date.now() - olderThanMinutes * 60_000) } },
    data: { status: "PENDING", lockedAt: null },
  });
  return res.count;
}

const CONCURRENCY = 5;

export async function runOutbox(opts: { ids?: string[]; limit?: number } = {}) {
  let api;
  try {
    api = getDiscordApi();
  } catch (err) {
    console.warn("[outbox] Discord nicht konfiguriert – Jobs bleiben in der Warteschlange.", (err as Error).message);
    return 0;
  }
  const jobs = await claim(opts.limit ?? 20, opts.ids);
  const one = async (job: OutboxJobLike) => {
    try {
      await processJob(job, api, prismaOutboxStore);
    } catch (err) {
      console.error("[outbox] Job-Verarbeitung fehlgeschlagen", job.id, err);
      await db.outboxJob.update({ where: { id: job.id }, data: { status: "PENDING", lockedAt: null, lastError: String(err) } }).catch(() => {});
    }
  };
  for (let i = 0; i < jobs.length; i += CONCURRENCY) await Promise.all(jobs.slice(i, i + CONCURRENCY).map(one));
  return jobs.length;
}

/**
 * Sofort zustellen und kurz warten (Nachricht ist dann direkt „zugestellt“).
 * Dauert es länger, läuft der Rest nach der Antwort weiter.
 */
export async function deliverNow(jobIds: string[], waitMs = 3000) {
  if (!jobIds.length) return;
  const run = runOutbox({ ids: jobIds }).catch((e) => console.error("[outbox]", e));
  await Promise.race([run, new Promise((r) => setTimeout(r, waitMs))]);
  try {
    const { after } = await import("next/server");
    after(() => runOutbox({ ids: jobIds }).catch((e) => console.error("[outbox]", e)));
  } catch {
    // außerhalb eines Requests
  }
}
