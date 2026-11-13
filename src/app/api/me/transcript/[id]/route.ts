import { db } from "@/lib/db";
import { accessErrorResponse, assertUser } from "@/lib/auth/session";
import { teamCanSeeTicket } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";

/** Transkript als Markdown-Datei herunterladen */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user, access;
  try {
    ({ user, access } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t?.transcript || (t.creatorId !== user.id && !teamCanSeeTicket(viewerOf(user, access.teamLevel), t))) return new Response("Nicht gefunden", { status: 404 });
  return new Response(t.transcript, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="transkript-${t.publicId}.md"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
