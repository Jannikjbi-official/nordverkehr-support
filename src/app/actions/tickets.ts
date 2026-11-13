"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { looksLikeBot } from "@/lib/spam";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";
import { addPlayerMessage, closeByPlayer, createTicket, rateTicket } from "@/lib/tickets/service";
import { deliverNow } from "@/lib/discord/outbox-db";
import { suggestForTicket } from "@/lib/help/service";
import { getCategory } from "@/lib/tickets/categories";
import { recordConsent } from "@/lib/consent";

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);
const atts = { attachmentIds: z.array(id).max(5).default([]), links: z.array(z.string().max(300)).max(5).default([]) };

async function player() {
  const ctx = await requireUser("/tickets/neu");
  if (ctx.access.guildBanned) throw new UserError("Solange du vom Discord gebannt bist, ist nur ein Entbannungsantrag möglich.");
  return ctx;
}

const CreateSchema = z.object({
  category: z.string().max(30),
  subject: z.string().max(200),
  body: z.string().max(5000),
  fields: z.record(z.string(), z.unknown()),
  accusedUserIds: z.array(id).max(5).default([]),
  consent: z.boolean().default(false),
  honeypot: z.string().optional(),
  startedAt: z.number().optional(),
  ...atts,
});

export async function createTicketAction(input: z.input<typeof CreateSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const p = CreateSchema.parse(input);
    const { user } = await player();
    if (looksLikeBot({ honeypot: p.honeypot, startedAt: p.startedAt })) throw new UserError("Das ging zu schnell. Bitte nochmal in Ruhe absenden.");
    const settings = await getSettings();
    await recordConsent(user.id, p.consent, settings["privacy.version"], user.consentVersion);
    const { ticket, jobIds } = await createTicket({
      creator: user,
      category: p.category,
      subject: p.subject,
      body: p.body,
      fields: p.fields,
      source: "WEB",
      attachmentIds: p.attachmentIds,
      links: p.links,
      accusedUserIds: p.accusedUserIds,
    });
    await deliverNow(jobIds, 1500);
    revalidatePath("/dashboard");
    return { ok: true, data: { id: ticket.id } };
  } catch (e) {
    return toActionError(e);
  }
}

const ReplySchema = z.object({ ticketId: id, body: z.string().max(5000), ...atts });

export async function replyTicketAction(input: z.input<typeof ReplySchema>): Promise<ActionResult> {
  try {
    const p = ReplySchema.parse(input);
    const { user } = await player();
    const { jobIds } = await addPlayerMessage({ user, ticketId: p.ticketId, body: p.body, attachmentIds: p.attachmentIds, links: p.links });
    await deliverNow(jobIds, 2000);
    revalidatePath(`/tickets/${p.ticketId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function closeTicketAction(ticketId: string): Promise<ActionResult> {
  try {
    const { user } = await player();
    const { jobIds } = await closeByPlayer(user, id.parse(ticketId));
    await deliverNow(jobIds, 1500);
    revalidatePath(`/tickets/${ticketId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function rateTicketAction(input: { ticketId: string; rating: number; comment?: string }): Promise<ActionResult> {
  try {
    const { user } = await requireUser();
    await rateTicket(user, id.parse(input.ticketId), Number(input.rating), input.comment);
    revalidatePath(`/tickets/${input.ticketId}`);
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** „Vielleicht hilft dir das schon“ – Artikelvorschläge beim Schreiben */
export async function suggestArticlesAction(text: string, category: string): Promise<{ title: string; url: string; summary: string }[]> {
  const t = String(text ?? "").slice(0, 400);
  if (t.trim().length < 6) return [];
  const hits = await suggestForTicket(t, getCategory(category)?.helpCategory, 3);
  return hits.filter((h) => h.score > 3).map((h) => ({ title: h.doc.title, url: `/hilfe/${h.doc.categorySlug}/${h.doc.slug}`, summary: h.doc.summary }));
}
