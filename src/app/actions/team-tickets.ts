"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTeam } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { addTeamMessage, changeStatus, claimTicket, transferTicket, updateTicketMeta, viewerOf } from "@/lib/tickets/service";
import { deliverNow } from "@/lib/discord/outbox-db";

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);
const STATUS = z.enum(["OPEN", "IN_PROGRESS", "WAITING_PLAYER", "RESOLVED", "CLOSED"]);

async function team() {
  const { user, access } = await assertTeam("SUPPORT");
  return { user, viewer: viewerOf(user, access.teamLevel) };
}

const done = async (ticketId: string, jobIds: string[] = []): Promise<ActionResult> => {
  await deliverNow(jobIds, 2000);
  revalidatePath(`/team/tickets/${ticketId}`);
  revalidatePath("/team/tickets");
  return { ok: true };
};

const ReplySchema = z.object({
  ticketId: id,
  body: z.string().max(5000),
  internal: z.boolean().default(false),
  setStatus: STATUS.nullable().optional(),
  attachmentIds: z.array(id).max(5).default([]),
  links: z.array(z.string().max(300)).max(5).default([]),
});

export async function teamReplyAction(input: z.input<typeof ReplySchema>): Promise<ActionResult> {
  try {
    const p = ReplySchema.parse(input);
    const { user, viewer } = await team();
    const { jobIds } = await addTeamMessage({ viewer, actor: user, ticketId: p.ticketId, body: p.body, internal: p.internal, setStatus: p.setStatus ?? null, attachmentIds: p.attachmentIds, links: p.links });
    return done(p.ticketId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

export async function teamStatusAction(ticketId: string, to: string, reason?: string): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    const { jobIds } = await changeStatus({ viewer, actor: user, ticketId: id.parse(ticketId), to: STATUS.parse(to), reason: reason?.slice(0, 200) });
    return done(ticketId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

export async function teamClaimAction(ticketId: string, action: "claim" | "release"): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    const { jobIds } = await claimTicket({ viewer, actor: user, ticketId: id.parse(ticketId), action: action === "release" ? "release" : "claim" });
    return done(ticketId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

export async function teamTransferAction(ticketId: string, toUserId: string): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    const { jobIds } = await transferTicket({ viewer, actor: user, ticketId: id.parse(ticketId), toUserId: id.parse(toUserId) });
    return done(ticketId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

const MetaSchema = z.object({
  ticketId: id,
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  tags: z.array(z.string().max(24)).max(10).optional(),
  accusedUserIds: z.array(id).max(5).optional(),
  sensitivity: z.enum(["NORMAL", "MOD_ONLY", "TEAM_COMPLAINT"]).optional(),
});

export async function teamMetaAction(input: z.input<typeof MetaSchema>): Promise<ActionResult> {
  try {
    const p = MetaSchema.parse(input);
    const { user, viewer } = await team();
    const { jobIds } = await updateTicketMeta({ viewer, actor: user, ...p });
    return done(p.ticketId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

// ─── KI: nur Entwürfe ────────────────────────────────────────

export async function aiDraftAction(ticketId: string): Promise<ActionResult<{ text: string; articles: { title: string; url: string }[]; suspicious: boolean }>> {
  try {
    const { user, viewer } = await team();
    const { draftReply } = await import("@/lib/ai/features");
    return { ok: true, data: await draftReply(viewer, user, id.parse(ticketId)) };
  } catch (e) {
    return aiError(e);
  }
}

export async function aiSummaryAction(ticketId: string): Promise<ActionResult<{ text: string; suspicious: boolean }>> {
  try {
    const { user, viewer } = await team();
    const { summarizeTicket } = await import("@/lib/ai/features");
    return { ok: true, data: await summarizeTicket(viewer, user, id.parse(ticketId)) };
  } catch (e) {
    return aiError(e);
  }
}

export async function aiClassifyAction(ticketId: string): Promise<ActionResult<{ category: string | null; priority: string | null; reason: string }>> {
  try {
    const { user, viewer } = await team();
    const { classifyTicket } = await import("@/lib/ai/features");
    return { ok: true, data: await classifyTicket(viewer, user, id.parse(ticketId)) };
  } catch (e) {
    return aiError(e);
  }
}

async function aiError(e: unknown): Promise<{ ok: false; error: string }> {
  const { AiError } = await import("@/lib/ai/service");
  if (e instanceof AiError) return { ok: false, error: e.message };
  return toActionError(e);
}
