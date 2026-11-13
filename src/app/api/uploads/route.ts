import { db } from "@/lib/db";
import { accessErrorResponse, assertUser } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";
import { forbiddenOrigin, isSameOrigin } from "@/lib/security";
import { ALLOWED_MIME, MAX_UPLOAD_BYTES, UploadError, processImage } from "@/lib/uploads/storage";

/**
 * Bild-Upload (Screenshots) für Tickets und Anträge. Ergebnis ist ein noch nicht
 * zugeordneter Anhang – zugeordnet wird beim Absenden (nur eigene Uploads).
 * Sicher: echte Bildprüfung, Neucodierung als WebP ohne Metadaten, max. 8 MB.
 */
export async function POST(req: Request) {
  if (!isSameOrigin(req)) return forbiddenOrigin();
  let user;
  try {
    // Auch Gebannte (Belege im Entbannungsantrag)
    ({ user } = await assertUser({ allowBanned: true }));
  } catch (err) {
    return accessErrorResponse(err);
  }
  const rl = await rateLimit(`upload:${user.id}`, 30, 3600);
  if (!rl.ok) return Response.json({ error: "Zu viele Uploads. Versuch es später nochmal." }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return Response.json({ error: "Die Datei ist zu groß (max. 8 MB)." }, { status: 413 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Keine Datei." }, { status: 400 });
  if (!ALLOWED_MIME.has(file.type)) return Response.json({ error: "Nur JPG, PNG oder WebP." }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "Die Datei ist zu groß (max. 8 MB)." }, { status: 413 });

  const pending = await db.attachment.count({ where: { ownerId: user.id, ticketId: null, requestId: null } });
  if (pending >= 15) return Response.json({ error: "Zu viele nicht verwendete Bilder. Schick erst ab oder entferne welche." }, { status: 429 });

  try {
    const processed = await processImage(Buffer.from(await file.arrayBuffer()));
    const a = await db.attachment.create({
      data: {
        ownerId: user.id,
        kind: "IMAGE",
        fileName: file.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "bild",
        mime: "image/webp",
        size: processed.data.length,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        data: new Uint8Array(processed.data),
      },
      select: { id: true, fileName: true, width: true, height: true },
    });
    return Response.json({ attachment: a });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 422 });
    console.error("[upload]", err);
    return Response.json({ error: "Upload fehlgeschlagen." }, { status: 500 });
  }
}
