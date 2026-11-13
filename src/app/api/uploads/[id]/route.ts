import { db } from "@/lib/db";
import { accessErrorResponse, assertUser } from "@/lib/auth/session";
import { forbiddenOrigin, isSameOrigin } from "@/lib/security";
import { teamCanSeeRequest, teamCanSeeTicket } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";

async function load(id: string) {
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return null;
  return db.attachment.findUnique({
    where: { id },
    include: { ticket: { select: { creatorId: true, sensitivity: true, accusedDiscordIds: true } }, request: { select: { applicantId: true, type: { select: { visibleFrom: true } } } } },
  });
}

/** Bild ausliefern – nur an Besitzer, Ersteller des Vorgangs oder Team mit Sichtrecht. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user, access;
  try {
    ({ user, access } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const a = await load(id);
  if (!a || a.kind !== "IMAGE" || !a.data) return new Response("Nicht gefunden", { status: 404 });
  const viewer = viewerOf(user, access.teamLevel);
  const allowed =
    a.ownerId === user.id ||
    (a.ticket && (a.ticket.creatorId === user.id || teamCanSeeTicket(viewer, a.ticket))) ||
    (a.request && (a.request.applicantId === user.id || teamCanSeeRequest(viewer, a.request.type)));
  if (!allowed) return new Response("Kein Zugriff", { status: 403 });
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(a.data.length),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": `inline; filename="${a.id}.webp"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/** Eigenes, noch nicht zugeordnetes Bild löschen. */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  let user;
  try {
    ({ user } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const a = await load(id);
  if (!a || a.ownerId !== user.id) return new Response("Nicht gefunden", { status: 404 });
  if (a.ticketId || a.requestId) return Response.json({ error: "Schon abgeschickt." }, { status: 409 });
  await db.attachment.delete({ where: { id: a.id } });
  return Response.json({ ok: true });
}
