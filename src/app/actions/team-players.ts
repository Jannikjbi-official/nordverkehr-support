"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);

export async function addNoteAction(subjectId: string, body: string): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("SUPPORT");
    const text = String(body).trim().slice(0, 2000);
    if (text.length < 2) throw new UserError("Die Notiz ist leer.");
    if (id.parse(subjectId) === user.id) throw new UserError("Keine Notizen über dich selbst.");
    await db.playerNote.create({ data: { subjectId, authorId: user.id, body: text } });
    await audit("player.note", { actorId: user.id, targetType: "user", targetId: subjectId });
    revalidatePath(`/team/spieler/${subjectId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

const SanctionSchema = z.object({
  subjectId: id,
  kind: z.enum(["BAN", "WARNING", "KICK", "JAIL", "FINE"]),
  reason: z.string().trim().min(3).max(1000),
  externalId: z.string().trim().max(60).optional(),
  banType: z.string().trim().max(60).optional(),
  endsAt: z.string().optional(),
  issuedByUserId: id.optional(),
});

/** Strafe eintragen (Moderation/Leitung) – Grundlage für Profil, Entbannung und Vier-Augen-Prinzip */
export async function addSanctionAction(input: z.input<typeof SanctionSchema>): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    const p = SanctionSchema.parse(input);
    const subject = await db.user.findUnique({ where: { id: p.subjectId } });
    if (!subject) throw new UserError("Person nicht gefunden.");
    const issuer = p.issuedByUserId ? await db.user.findUnique({ where: { id: p.issuedByUserId } }) : user;
    if (p.externalId && (await db.sanction.findFirst({ where: { externalId: p.externalId } }))) throw new UserError("Diese Ban-ID gibt es schon.");
    const endsAt = p.endsAt ? new Date(p.endsAt) : null;
    const s = await db.sanction.create({
      data: {
        subjectDiscordId: subject.discordId,
        subjectId: subject.id,
        kind: p.kind,
        reason: p.reason,
        externalId: p.externalId || null,
        banType: p.banType || null,
        endsAt: endsAt && !Number.isNaN(endsAt.getTime()) ? endsAt : null,
        issuedByDiscordId: issuer?.discordId ?? null,
        issuedByName: issuer ? issuer.globalName || issuer.username : null,
        createdById: user.id,
      },
    });
    await audit("sanction.create", { actorId: user.id, targetType: "user", targetId: subject.id, meta: { sanctionId: s.id, kind: p.kind } });
    revalidatePath(`/team/spieler/${subject.id}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function liftSanctionAction(sanctionId: string, note: string): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    const s = await db.sanction.update({ where: { id: id.parse(sanctionId) }, data: { liftedAt: new Date(), liftedNote: String(note).slice(0, 500) || null } });
    await audit("sanction.lift", { actorId: user.id, targetType: "user", targetId: s.subjectId ?? undefined, meta: { sanctionId } });
    if (s.subjectId) revalidatePath(`/team/spieler/${s.subjectId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
