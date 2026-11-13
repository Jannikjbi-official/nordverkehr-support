"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { looksLikeBot } from "@/lib/spam";
import { recordConsent } from "@/lib/consent";
import { toActionError, type ActionResult } from "@/lib/errors";
import { playerAnswer, submitRequest } from "@/lib/requests/service";
import { deliverNow } from "@/lib/discord/outbox-db";

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);

const SubmitSchema = z.object({
  typeSlug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  answers: z.record(z.string(), z.unknown()),
  honesty: z.boolean().default(false),
  consent: z.boolean().default(false),
  attachmentIds: z.array(id).max(5).default([]),
  links: z.array(z.string().max(300)).max(5).default([]),
  honeypot: z.string().optional(),
  startedAt: z.number().optional(),
});

/** Antrag einreichen – auch für vom Discord gebannte Personen (nur erlaubte Arten, Prüfung im Service) */
export async function submitRequestAction(input: z.input<typeof SubmitSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const p = SubmitSchema.parse(input);
    const { user, access } = await requireUser("/antraege");
    if (looksLikeBot({ honeypot: p.honeypot, startedAt: p.startedAt })) return { ok: false, error: "Das ging zu schnell. Bitte nochmal in Ruhe absenden." };
    const settings = await getSettings();
    await recordConsent(user.id, p.consent, settings["privacy.version"], user.consentVersion);
    const { request, jobIds } = await submitRequest({
      user,
      banned: access.guildBanned,
      typeSlug: p.typeSlug,
      answers: p.answers,
      honesty: p.honesty,
      attachmentIds: p.attachmentIds,
      links: p.links,
    });
    await deliverNow(jobIds, 1500);
    revalidatePath("/antraege");
    return { ok: true, data: { id: request.id } };
  } catch (e) {
    return toActionError(e);
  }
}

const AnswerSchema = z.object({ requestId: id, body: z.string().max(5000), attachmentIds: z.array(id).max(5).default([]), links: z.array(z.string().max(300)).max(5).default([]) });

export async function answerRequestAction(input: z.input<typeof AnswerSchema>): Promise<ActionResult> {
  try {
    const p = AnswerSchema.parse(input);
    const { user } = await requireUser("/antraege");
    await playerAnswer(user, p.requestId, p.body, p.attachmentIds, p.links);
    revalidatePath(`/antraege/${p.requestId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
