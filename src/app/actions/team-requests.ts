"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertTeam } from "@/lib/auth/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { viewerOf } from "@/lib/tickets/service";
import { addComment, approveDecision, proposeDecision, setIssuer, setRequestStatus, teamMessage, vote, withdrawProposal } from "@/lib/requests/service";
import { deliverNow } from "@/lib/discord/outbox-db";

const id = z.string().regex(/^[a-z0-9]{10,40}$/i);

async function team() {
  const { user, access } = await assertTeam("SUPPORT");
  return { user, viewer: viewerOf(user, access.teamLevel) };
}

const ok = async (requestId: string, jobIds: string[] = []): Promise<ActionResult> => {
  await deliverNow(jobIds, 2000);
  revalidatePath(`/team/antraege/${requestId}`);
  revalidatePath("/team/antraege");
  return { ok: true };
};

export async function requestMessageAction(requestId: string, body: string, asQuestion: boolean): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    const { jobIds } = await teamMessage(viewer, user, id.parse(requestId), String(body), { asQuestion: !!asQuestion });
    return ok(requestId, jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestCommentAction(requestId: string, body: string): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    await addComment(viewer, user, id.parse(requestId), String(body));
    return ok(requestId);
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestVoteAction(requestId: string, value: "PRO" | "CONTRA" | "ABSTAIN" | null): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    await vote(viewer, user, id.parse(requestId), value === null ? null : z.enum(["PRO", "CONTRA", "ABSTAIN"]).parse(value));
    return ok(requestId);
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestStatusAction(requestId: string, to: "IN_REVIEW" | "ARCHIVED"): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    await setRequestStatus(viewer, user, id.parse(requestId), z.enum(["IN_REVIEW", "ARCHIVED"]).parse(to));
    return ok(requestId);
  } catch (e) {
    return toActionError(e);
  }
}

export async function requestIssuerAction(requestId: string, issuerUserId: string | null): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    await setIssuer(viewer, user, id.parse(requestId), issuerUserId ? id.parse(issuerUserId) : null);
    return ok(requestId);
  } catch (e) {
    return toActionError(e);
  }
}

export async function proposeDecisionAction(requestId: string, outcomeKey: string, reason: string): Promise<ActionResult<{ decided: boolean }>> {
  try {
    const { user, viewer } = await team();
    const r = await proposeDecision(viewer, user, id.parse(requestId), z.string().max(40).parse(outcomeKey), String(reason));
    await ok(requestId, r.jobIds);
    return { ok: true, data: { decided: r.decided }, message: r.decided ? "Entschieden." : "Vorschlag gespeichert – jetzt muss eine zweite Person zustimmen." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function approveDecisionAction(requestId: string, decisionId: string): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    const r = await approveDecision(viewer, user, id.parse(decisionId));
    return ok(requestId, r.jobIds);
  } catch (e) {
    return toActionError(e);
  }
}

export async function withdrawProposalAction(requestId: string, decisionId: string): Promise<ActionResult> {
  try {
    const { user, viewer } = await team();
    await withdrawProposal(viewer, user, id.parse(decisionId));
    return ok(requestId);
  } catch (e) {
    return toActionError(e);
  }
}

export async function aiRequestSummaryAction(requestId: string): Promise<ActionResult<{ text: string; suspicious: boolean }>> {
  try {
    const { user, viewer } = await team();
    const { summarizeRequest } = await import("@/lib/ai/features");
    return { ok: true, data: await summarizeRequest(viewer, user, id.parse(requestId)) };
  } catch (e) {
    const { AiError } = await import("@/lib/ai/service");
    if (e instanceof AiError) return { ok: false, error: e.message };
    return toActionError(e);
  }
}
