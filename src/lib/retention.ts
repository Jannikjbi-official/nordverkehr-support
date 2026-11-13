/**
 * Löschfristen (DSGVO): Fristen im Admin-Bereich einstellbar.
 */
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

const DAY = 86_400_000;
const monthsAgo = (m: number) => new Date(Date.now() - m * 30 * DAY);
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

export async function runRetention() {
  const s = await getSettings();
  const oldTickets = await db.ticket.findMany({ where: { status: "CLOSED", closedAt: { lt: monthsAgo(s["retention.ticketMonths"]) } }, select: { id: true }, take: 500 });
  const ticketIds = oldTickets.map((t) => t.id);
  if (ticketIds.length) {
    await db.attachment.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await db.ticketMessage.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await db.ticketEvent.deleteMany({ where: { ticketId: { in: ticketIds } } });
    await db.ticket.deleteMany({ where: { id: { in: ticketIds } } });
  }
  const oldRequests = await db.request.findMany({
    where: { status: { in: ["ARCHIVED", "DECIDED", "WITHDRAWN"] }, OR: [{ decidedAt: { lt: monthsAgo(s["retention.requestMonths"]) } }, { decidedAt: null, updatedAt: { lt: monthsAgo(s["retention.requestMonths"]) } }] },
    select: { id: true },
    take: 500,
  });
  const requestIds = oldRequests.map((r) => r.id);
  if (requestIds.length) {
    await db.attachment.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.requestMessage.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.requestComment.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.requestVote.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.requestDecision.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.request.deleteMany({ where: { id: { in: requestIds } } });
  }
  const images = await db.attachment.deleteMany({ where: { kind: "IMAGE", createdAt: { lt: daysAgo(s["retention.attachmentDays"]) } } });
  // Nie zugeordnete Uploads (Formular abgebrochen) nach einem Tag
  const orphans = await db.attachment.deleteMany({ where: { ticketId: null, requestId: null, createdAt: { lt: daysAgo(1) } } });
  const searches = await db.searchMiss.deleteMany({ where: { lastAt: { lt: daysAgo(s["retention.searchDays"]) } } });
  const auditRows = await db.auditLog.deleteMany({ where: { createdAt: { lt: monthsAgo(s["retention.auditMonths"]) } } });
  const outbox = await db.outboxJob.deleteMany({ where: { status: { in: ["DONE", "FAILED"] }, updatedAt: { lt: daysAgo(30) } } });
  const limits = await db.rateLimit.deleteMany({ where: { resetAt: { lt: daysAgo(1) } } });
  const cooldowns = await db.cooldown.deleteMany({ where: { until: { lt: daysAgo(365) } } });
  const feedback = await db.articleFeedback.deleteMany({ where: { createdAt: { lt: monthsAgo(24) } } });
  const result = {
    tickets: ticketIds.length,
    requests: requestIds.length,
    images: images.count,
    orphans: orphans.count,
    searches: searches.count,
    audit: auditRows.count,
    outbox: outbox.count,
    rateLimits: limits.count,
    cooldowns: cooldowns.count,
    feedback: feedback.count,
  };
  if (ticketIds.length || requestIds.length || images.count) await audit("retention.cleanup", { meta: result });
  return result;
}
