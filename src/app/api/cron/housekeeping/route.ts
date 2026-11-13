import { isAuthorizedCron } from "@/lib/cron";
import { acquireLease, runHousekeeping } from "@/lib/housekeeping";

export const maxDuration = 60;

/**
 * Hintergrundarbeiten (Vercel Cron bzw. externer Scheduler mit CRON_SECRET):
 * Outbox, Discord-Abgleich, Erinnerungen, Auto-Close, Archivierung, Löschfristen.
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) return new Response("Unauthorized", { status: 401 });
  // Nicht parallel zu einem gerade laufenden Durchlauf (z. B. durch Seitenaufrufe)
  if (!(await acquireLease("housekeeping", 2 * 60_000))) return Response.json({ skipped: "läuft schon" });
  const report = await runHousekeeping({ budgetMs: 50_000, withRetention: true });
  return Response.json({ ok: true, report });
}
