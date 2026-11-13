import { db } from "@/lib/db";
import { accessErrorResponse, assertUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

/** DSGVO-Export: alle eigenen Daten als JSON (ohne interne Notizen des Teams) */
export async function GET() {
  let user;
  try {
    ({ user } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const rl = await rateLimit(`export:${user.id}`, 5, 3600);
  if (!rl.ok) return Response.json({ error: "Zu viele Exporte. Später nochmal." }, { status: 429 });

  const [tickets, requests, sanctions] = await Promise.all([
    db.ticket.findMany({
      where: { creatorId: user.id },
      select: {
        publicId: true,
        category: true,
        subject: true,
        fields: true,
        status: true,
        source: true,
        createdAt: true,
        closedAt: true,
        rating: true,
        ratingComment: true,
        messages: { where: { kind: { not: "INTERNAL" } }, orderBy: { createdAt: "asc" }, select: { authorName: true, kind: true, body: true, source: true, createdAt: true } },
        attachments: { select: { kind: true, url: true, fileName: true, createdAt: true } },
      },
    }),
    db.request.findMany({
      where: { applicantId: user.id },
      select: {
        publicId: true,
        type: { select: { title: true } },
        answers: true,
        status: true,
        outcomeLabel: true,
        decisionReason: true,
        createdAt: true,
        decidedAt: true,
        messages: { orderBy: { createdAt: "asc" }, select: { authorName: true, kind: true, body: true, createdAt: true } },
      },
    }),
    db.sanction.findMany({ where: { subjectDiscordId: user.discordId }, select: { kind: true, reason: true, startsAt: true, endsAt: true, liftedAt: true, externalId: true } }),
  ]);
  await audit("user.export", { actorId: user.id, targetType: "user", targetId: user.id });
  const data = {
    exportiertAm: new Date().toISOString(),
    konto: {
      discordId: user.discordId,
      benutzername: user.username,
      anzeigename: user.globalName,
      erstelltAm: user.createdAt,
      letzterLogin: user.lastLoginAt,
      dmsAus: user.dmOptOut,
      datenschutzVersion: user.consentVersion,
      datenschutzBestaetigt: user.consentAt,
    },
    tickets,
    antraege: requests,
    strafen: sanctions,
  };
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="nordverkehr-support-daten-${user.username}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
