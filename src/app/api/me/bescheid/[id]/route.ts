import { accessErrorResponse, assertUser } from "@/lib/auth/session";
import { viewerOf } from "@/lib/tickets/service";
import { certificatePdfFor } from "@/lib/requests/certificate-db";
import { certificateFileName } from "@/lib/requests/certificate";

/** Bescheid (PDF) für einen angenommenen Antrag – für den Antragsteller und das Team */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  let user, access;
  try {
    ({ user, access } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const { id } = await ctx.params;
  const result = await certificatePdfFor(id, user, viewerOf(user, access.teamLevel));
  if (!result) return new Response("Nicht gefunden", { status: 404 });
  const inline = new URL(req.url).searchParams.get("ansehen") === "1";
  return new Response(Buffer.from(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${certificateFileName(result.publicId)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
