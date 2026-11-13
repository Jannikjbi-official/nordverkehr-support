/**
 * Datenbank-Anbindung der Bescheide: Daten laden, Rechte prüfen, PDF bauen.
 */
import type { Prisma, User } from "@prisma/client";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { teamCanSeeRequest, type Viewer } from "@/lib/perms";
import { buildNameChangePdf, codeMatches, hasCertificate, verificationCode } from "@/lib/requests/certificate";

const nameOf = (u: Pick<User, "globalName" | "username"> | null | undefined) => (u ? u.globalName || u.username : "Team");
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export const verifyUrl = () => `${publicEnv.appUrl}/bescheid/pruefen`;
export const certificateUrl = (requestId: string) => `/api/me/bescheid/${requestId}`;

async function loadDecided(where: Prisma.RequestWhereUniqueInput) {
  return db.request.findUnique({ where, include: { type: true } });
}

/** PDF für Antragsteller oder Team (mit Sichtrecht). null = gibt es nicht / kein Zugriff. */
export async function certificatePdfFor(requestId: string, user: Pick<User, "id">, viewer: Viewer): Promise<{ pdf: Uint8Array; publicId: string } | null> {
  const r = await loadDecided({ id: requestId });
  if (!r || !hasCertificate(r)) return null;
  if (r.applicantId !== user.id && !teamCanSeeRequest(viewer, r.type)) return null;
  const answers = (r.answers ?? {}) as Record<string, unknown>;
  const [decider, approver] = await Promise.all([
    r.decidedById ? db.user.findUnique({ where: { id: r.decidedById }, select: { globalName: true, username: true } }) : null,
    r.approvedById ? db.user.findUnique({ where: { id: r.approvedById }, select: { globalName: true, username: true } }) : null,
  ]);
  const pdf = await buildNameChangePdf({
    publicId: r.publicId,
    submittedAt: r.createdAt,
    decidedAt: r.decidedAt!,
    currentName: str(answers.current_name) || "–",
    newName: str(answers.new_name) || "–",
    decidedBy: nameOf(decider),
    approvedBy: approver ? nameOf(approver) : null,
    code: verificationCode(r.id),
    verifyUrl: verifyUrl(),
  });
  return { pdf, publicId: r.publicId };
}

export type VerifyResult =
  | { ok: true; publicId: string; currentName: string; newName: string; decidedAt: Date }
  | { ok: false };

/** Öffentliche Echtheitsprüfung – verrät nur Charakternamen und Datum, nichts über die Person dahinter. */
export async function verifyCertificate(publicId: string, code: string): Promise<VerifyResult> {
  const id = publicId.trim().toUpperCase();
  if (!/^NVA-\d{4}-\d{1,6}$/.test(id)) return { ok: false };
  const r = await loadDecided({ publicId: id });
  if (!r || !hasCertificate(r) || !codeMatches(r.id, code)) return { ok: false };
  const answers = (r.answers ?? {}) as Record<string, unknown>;
  return { ok: true, publicId: r.publicId, currentName: str(answers.current_name), newName: str(answers.new_name), decidedAt: r.decidedAt! };
}
