/**
 * Anträge (serverseitig): Einreichen, Rückfragen, Diskussion, Abstimmung,
 * Entscheidungsvorschlag + Zustimmung (Vier-Augen-Prinzip), Sperrfristen.
 * Die KI ist hier nie beteiligt – Entscheidungen treffen ausschließlich Menschen.
 */
import type { Prisma, RequestStatus, RequestType, User, VoteValue } from "@prisma/client";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { nextPublicId } from "@/lib/ids";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkSpam } from "@/lib/spam";
import { checkApproval, checkPropose, isOpenRequest, needsSecondApproval, teamCanSeeRequest, type Viewer } from "@/lib/perms";
import { answersSchema, checkEligibility, cooldownDaysFor, parseFields, parseOutcomes } from "@/lib/requests/model";
import { lookupBanById } from "@/lib/requests/ban-provider";
import { clipProvider } from "@/lib/uploads/links";
import { enqueue } from "@/lib/discord/outbox-db";
import { isTestDiscordId } from "@/lib/discord/outbox";
import { buildLogLine, buildRequestDm } from "@/lib/discord/messages";
import { hasCertificate } from "@/lib/requests/certificate";

const name = (u: Pick<User, "globalName" | "username">) => u.globalName || u.username;
export const requestUrl = (id: string) => `${publicEnv.appUrl}/antraege/${id}`;
export const teamRequestUrl = (id: string) => `${publicEnv.appUrl}/team/antraege/${id}`;

export async function eligibilityFor(user: Pick<User, "id">, type: RequestType, banned: boolean) {
  const [openCount, cooldown] = await Promise.all([
    db.request.count({ where: { applicantId: user.id, typeId: type.id, status: { in: ["SUBMITTED", "IN_REVIEW", "QUESTION"] } } }),
    db.cooldown.findFirst({ where: { userId: user.id, typeId: type.id, until: { gt: new Date() } }, orderBy: { until: "desc" } }),
  ]);
  return checkEligibility({ type, banned, openCount, cooldownUntil: cooldown?.until ?? null });
}

// ─── Einreichen ──────────────────────────────────────────────

export async function submitRequest(input: {
  user: User;
  banned: boolean;
  typeSlug: string;
  answers: Record<string, unknown>;
  honesty: boolean;
  attachmentIds?: string[];
  links?: string[];
}) {
  const type = await db.requestType.findUnique({ where: { slug: input.typeSlug } });
  if (!type) throw new UserError("Unbekannte Antragsart.");
  const elig = await eligibilityFor(input.user, type, input.banned);
  if (!elig.ok) throw new UserError(elig.reason);
  if (type.requireHonesty && !input.honesty) throw new UserError("Bitte bestätige, dass du ehrlich geantwortet hast.");
  await enforceRateLimit(`request:create:${input.user.id}`, 5, 3600);

  const fields = parseFields(type.fields);
  const parsed = answersSchema(fields).safeParse(input.answers);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Bitte prüf deine Angaben.");
  const answers = parsed.data as Record<string, unknown>;

  const longText = Object.values(answers).filter((v): v is string => typeof v === "string").join("\n");
  const recent = await db.request.findMany({ where: { applicantId: input.user.id, createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }, select: { answers: true }, take: 10 });
  const spam = checkSpam(longText || "x".repeat(3), {
    recentOwn: recent.map((r) => Object.values(r.answers as Record<string, unknown>).filter((v) => typeof v === "string").join("\n")),
  });
  if (!spam.ok && longText.length > 0) throw new UserError(spam.reason);

  // Strafe zuordnen (Ban-ID → eingetragene Sanktion → wer sie ausgesprochen hat)
  const banRef = typeof answers.ban_ref === "string" ? answers.ban_ref.trim() : "";
  const banType = typeof answers.ban_type === "string" && answers.ban_type ? answers.ban_type : null;
  const ban = type.needsSanction && banRef ? await lookupBanById(banRef) : null;

  const publicId = await nextPublicId(env().REQUEST_ID_PREFIX);
  const now = new Date();
  const request = await db.$transaction(async (tx) => {
    const r = await tx.request.create({
      data: {
        publicId,
        typeId: type.id,
        applicantId: input.user.id,
        answers: answers as Prisma.InputJsonValue,
        banRef: banRef || null,
        banType: banType ?? ban?.banType ?? null,
        sanctionId: ban?.sanctionId ?? null,
        issuedByDiscordId: ban?.issuedByDiscordId ?? null,
        honestyConfirmedAt: type.requireHonesty ? now : null,
        lastPlayerAt: now,
        isTest: input.user.isTest,
      },
    });
    if (input.attachmentIds?.length) {
      await tx.attachment.updateMany({ where: { id: { in: input.attachmentIds.slice(0, 5) }, ownerId: input.user.id, ticketId: null, requestId: null }, data: { requestId: r.id } });
    }
    for (const url of (input.links ?? []).slice(0, 5)) {
      const provider = clipProvider(url);
      if (provider) await tx.attachment.create({ data: { ownerId: input.user.id, kind: "LINK", url, provider, requestId: r.id } });
    }
    await tx.requestMessage.create({ data: { requestId: r.id, authorName: "System", kind: "SYSTEM", body: `Antrag eingereicht (${type.title}).` } });
    return r;
  });
  await audit("request.submit", { actorId: input.user.id, targetType: "request", targetId: request.id, meta: { publicId, type: type.slug } });

  const jobIds: string[] = [];
  const logChannel = env().DISCORD_LOG_CHANNEL_ID;
  if (logChannel && !request.isTest) {
    const sensitive = type.visibleFrom !== "SUPPORT";
    const job = await enqueue({ type: "CHANNEL_MESSAGE", channelId: logChannel, kind: "log", message: buildLogLine(`📄 Neuer Antrag **${publicId}** · ${type.title}${sensitive ? " (Moderation/Leitung)" : ""}`, { url: teamRequestUrl(request.id) }) });
    jobIds.push(job.id);
  }
  return { request, jobIds };
}

// ─── Laden mit Rechteprüfung ─────────────────────────────────

export async function loadRequestForTeam(viewer: Viewer, id: string) {
  const r = await db.request.findUnique({ where: { id }, include: { type: true, applicant: true } });
  if (!r || !teamCanSeeRequest(viewer, r.type)) throw new UserError("Antrag nicht gefunden.");
  return r;
}

export async function loadRequestForPlayer(userId: string, id: string) {
  const r = await db.request.findUnique({ where: { id }, include: { type: true } });
  if (!r || r.applicantId !== userId) throw new UserError("Antrag nicht gefunden.");
  return r;
}

async function dmApplicant(applicant: User, input: { publicId: string; typeTitle: string; title: string; body: string; requestId: string }, requestMessageId?: string) {
  // Gebannte Personen teilen meist keinen Server mit dem Bot → DM scheitert; im Portal steht trotzdem alles
  if (applicant.dmOptOut || isTestDiscordId(applicant.discordId)) return null;
  const job = await enqueue(
    { type: "DM", discordUserId: applicant.discordId, purpose: input.title.startsWith("Entscheidung") ? "request_decision" : "request_message", message: buildRequestDm({ ...input, url: requestUrl(input.requestId) }) },
    { requestMessageId },
  );
  return job.id;
}

// ─── Spieler ─────────────────────────────────────────────────

export async function playerAnswer(user: User, requestId: string, body: string, attachmentIds: string[] = [], links: string[] = []) {
  const r = await loadRequestForPlayer(user.id, requestId);
  if (!isOpenRequest(r.status)) throw new UserError("Der Antrag ist schon entschieden.");
  const text = body.trim().slice(0, 4000);
  await enforceRateLimit(`request:msg:${user.id}`, 15, 600);
  const own = await db.requestMessage.findMany({ where: { authorId: user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } }, select: { body: true }, take: 10 });
  const spam = checkSpam(text, { recentOwn: own.map((o) => o.body) });
  if (!spam.ok) throw new UserError(spam.reason);
  await db.$transaction(async (tx) => {
    await tx.requestMessage.create({ data: { requestId: r.id, authorId: user.id, authorName: name(user), kind: "PLAYER", body: text } });
    if (attachmentIds.length) await tx.attachment.updateMany({ where: { id: { in: attachmentIds.slice(0, 5) }, ownerId: user.id, ticketId: null, requestId: null }, data: { requestId: r.id } });
    for (const url of links.slice(0, 5)) {
      const provider = clipProvider(url);
      if (provider) await tx.attachment.create({ data: { ownerId: user.id, kind: "LINK", url, provider, requestId: r.id } });
    }
    await tx.request.update({ where: { id: r.id }, data: { lastPlayerAt: new Date(), ...(r.status === "QUESTION" ? { status: "IN_REVIEW" } : {}) } });
  });
}

// ─── Team ────────────────────────────────────────────────────

export async function setRequestStatus(viewer: Viewer, actor: User, id: string, to: Extract<RequestStatus, "IN_REVIEW" | "ARCHIVED">) {
  const r = await loadRequestForTeam(viewer, id);
  if (to === "IN_REVIEW" && !isOpenRequest(r.status)) throw new UserError("Der Antrag ist schon entschieden.");
  if (to === "ARCHIVED" && r.status !== "DECIDED") throw new UserError("Archivieren geht erst nach der Entscheidung.");
  await db.request.update({ where: { id: r.id }, data: { status: to, ...(to === "ARCHIVED" ? { archivedAt: new Date() } : {}) } });
  await audit("request.status", { actorId: actor.id, targetType: "request", targetId: r.id, meta: { from: r.status, to } });
}

/** Rückfrage an den Spieler (Status → Rückfrage, DM) oder normale Nachricht */
export async function teamMessage(viewer: Viewer, actor: User, id: string, body: string, opts: { asQuestion: boolean }) {
  const r = await loadRequestForTeam(viewer, id);
  if (!isOpenRequest(r.status)) throw new UserError("Der Antrag ist schon entschieden.");
  const text = body.trim().slice(0, 4000);
  if (text.length < 2) throw new UserError("Die Nachricht ist leer.");
  const msg = await db.$transaction(async (tx) => {
    const m = await tx.requestMessage.create({ data: { requestId: r.id, authorId: actor.id, authorName: name(actor), kind: "TEAM", body: text, deliveryStatus: r.applicant.dmOptOut ? "NOT_SENT" : "PENDING" } });
    await tx.request.update({ where: { id: r.id }, data: { status: opts.asQuestion ? "QUESTION" : r.status === "SUBMITTED" ? "IN_REVIEW" : r.status } });
    return m;
  });
  await audit("request.message", { actorId: actor.id, targetType: "request", targetId: r.id });
  const job = await dmApplicant(r.applicant, { publicId: r.publicId, typeTitle: r.type.title, title: opts.asQuestion ? "Rückfrage zu deinem Antrag" : "Nachricht zu deinem Antrag", body: text, requestId: r.id }, msg.id);
  if (!job) await db.requestMessage.update({ where: { id: msg.id }, data: { deliveryStatus: "NOT_SENT" } });
  return { jobIds: job ? [job] : [] };
}

export async function addComment(viewer: Viewer, actor: User, id: string, body: string) {
  const r = await loadRequestForTeam(viewer, id);
  const text = body.trim().slice(0, 3000);
  if (text.length < 2) throw new UserError("Der Kommentar ist leer.");
  await db.requestComment.create({ data: { requestId: r.id, authorId: actor.id, body: text } });
  await audit("request.comment", { actorId: actor.id, targetType: "request", targetId: r.id });
}

export async function vote(viewer: Viewer, actor: User, id: string, value: VoteValue | null) {
  const r = await loadRequestForTeam(viewer, id);
  if (!isOpenRequest(r.status)) throw new UserError("Der Antrag ist schon entschieden.");
  if (r.applicantId === actor.id) throw new UserError("Über eigene Anträge stimmst du nicht ab.");
  if (value === null) await db.requestVote.deleteMany({ where: { requestId: r.id, userId: actor.id } });
  else await db.requestVote.upsert({ where: { requestId_userId: { requestId: r.id, userId: actor.id } }, create: { requestId: r.id, userId: actor.id, value }, update: { value } });
  await audit("request.vote", { actorId: actor.id, targetType: "request", targetId: r.id, meta: { value } });
}

/** Wer hat die Strafe ausgesprochen? (Moderation/Leitung pflegt das – wichtig fürs Vier-Augen-Prinzip) */
export async function setIssuer(viewer: Viewer, actor: User, id: string, issuerUserId: string | null) {
  const r = await loadRequestForTeam(viewer, id);
  if (viewer.teamLevel === "SUPPORT") throw new UserError("Das darf nur Moderation/Leitung.");
  if (!isOpenRequest(r.status)) throw new UserError("Der Antrag ist schon entschieden.");
  let discordId: string | null = null;
  if (issuerUserId) {
    const u = await db.user.findUnique({ where: { id: issuerUserId }, select: { discordId: true, teamLevel: true } });
    if (!u || u.teamLevel === "NONE") throw new UserError("Diese Person ist nicht im Team.");
    discordId = u.discordId;
  }
  // Offene Vorschläge, die jetzt gegen das Vier-Augen-Prinzip verstoßen würden, bleiben offen – die Zustimmung wird beim Bestätigen geprüft
  await db.request.update({ where: { id: r.id }, data: { issuedByDiscordId: discordId } });
  await audit("request.status", { actorId: actor.id, targetType: "request", targetId: r.id, meta: { issuer: discordId } });
}

/**
 * Entscheidung vorschlagen. Braucht die Antragsart (oder die Person) keine zweite
 * Zustimmung, gilt sie sofort; sonst wartet sie auf eine zweite Person.
 */
export async function proposeDecision(viewer: Viewer, actor: User, id: string, outcomeKey: string, reason: string) {
  const r = await loadRequestForTeam(viewer, id);
  const check = checkPropose(viewer, r.type, r);
  if (!check.ok) throw new UserError(check.reason);
  const outcome = parseOutcomes(r.type.outcomes).find((o) => o.key === outcomeKey);
  if (!outcome) throw new UserError("Bitte ein Ergebnis wählen.");
  const text = reason.trim().slice(0, 3000);
  if (text.length < 10) throw new UserError("Die Begründung ist Pflicht (mind. 10 Zeichen) – der Spieler sieht sie.");

  // Ältere offene Vorschläge werden ersetzt
  await db.requestDecision.updateMany({ where: { requestId: r.id, status: "PENDING" }, data: { status: "SUPERSEDED" } });
  const decision = await db.requestDecision.create({ data: { requestId: r.id, proposedById: actor.id, outcomeKey: outcome.key, reason: text } });
  await audit("request.propose", { actorId: actor.id, targetType: "request", targetId: r.id, meta: { outcome: outcome.key } });
  if (r.status === "SUBMITTED") await db.request.update({ where: { id: r.id }, data: { status: "IN_REVIEW" } });

  if (needsSecondApproval(r.type, r, viewer)) return { decided: false as const, decisionId: decision.id, jobIds: [] as string[] };
  const jobIds = await finalize(r.id, decision.id, actor, null);
  return { decided: true as const, decisionId: decision.id, jobIds };
}

/** Zweite Person bestätigt den Vorschlag (Vier-Augen-Prinzip) */
export async function approveDecision(viewer: Viewer, actor: User, decisionId: string) {
  const d = await db.requestDecision.findUnique({ where: { id: decisionId } });
  if (!d) throw new UserError("Vorschlag nicht gefunden.");
  const r = await loadRequestForTeam(viewer, d.requestId);
  const check = checkApproval(viewer, r.type, r, d);
  if (!check.ok) throw new UserError(check.reason);
  // Atomar: nur ein Bestätigen gewinnt
  const won = await db.requestDecision.updateMany({ where: { id: d.id, status: "PENDING" }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date() } });
  if (!won.count) throw new UserError("Der Vorschlag wurde gerade schon bearbeitet.");
  await audit("request.approve", { actorId: actor.id, targetType: "request", targetId: r.id, meta: { decisionId: d.id } });
  const proposer = await db.user.findUniqueOrThrow({ where: { id: d.proposedById } });
  return { jobIds: await finalize(r.id, d.id, proposer, actor) };
}

export async function withdrawProposal(viewer: Viewer, actor: User, decisionId: string) {
  const d = await db.requestDecision.findUnique({ where: { id: decisionId } });
  if (!d || d.status !== "PENDING") throw new UserError("Kein offener Vorschlag.");
  await loadRequestForTeam(viewer, d.requestId);
  if (d.proposedById !== actor.id && viewer.teamLevel !== "LEITUNG") throw new UserError("Nur wer vorgeschlagen hat (oder die Leitung) kann zurückziehen.");
  await db.requestDecision.update({ where: { id: d.id }, data: { status: "WITHDRAWN" } });
  await audit("request.withdraw_proposal", { actorId: actor.id, targetType: "request", targetId: d.requestId });
}

/** Entscheidung wirksam machen: Ergebnis, Sperrfrist, DM, Log, Audit */
async function finalize(requestId: string, decisionId: string, proposer: User, approver: User | null): Promise<string[]> {
  const r = await db.request.findUniqueOrThrow({ where: { id: requestId }, include: { type: true, applicant: true } });
  const d = await db.requestDecision.findUniqueOrThrow({ where: { id: decisionId } });
  const outcome = parseOutcomes(r.type.outcomes).find((o) => o.key === d.outcomeKey)!;
  const now = new Date();
  // Nur offene Anträge entscheiden (atomar)
  const won = await db.request.updateMany({
    where: { id: r.id, status: { in: ["SUBMITTED", "IN_REVIEW", "QUESTION"] } },
    data: {
      status: "DECIDED",
      outcomeKey: outcome.key,
      outcomeLabel: outcome.label,
      outcomeCategory: outcome.category,
      decisionReason: d.reason,
      decidedAt: now,
      decidedById: proposer.id,
      approvedById: approver?.id ?? null,
    },
  });
  if (!won.count) throw new UserError("Der Antrag wurde gerade schon entschieden.");
  if (!approver) await db.requestDecision.update({ where: { id: d.id }, data: { status: "APPROVED" } });

  if (outcome.category === "REJECTED") {
    const days = cooldownDaysFor(r.type, r.banType);
    if (days > 0) await db.cooldown.create({ data: { userId: r.applicantId, typeId: r.typeId, banType: r.banType, until: new Date(now.getTime() + days * 86_400_000), requestId: r.id } });
  }
  const certNote = hasCertificate({ status: "DECIDED", outcomeCategory: outcome.category, decidedAt: now, type: r.type })
    ? "\n\n📄 Dein Bescheid fürs Rathaus liegt im Portal bei diesem Antrag als PDF bereit. Lade ihn herunter und gib ihn ingame im Rathaus ab – dort bekommst du neue Papiere."
    : "";
  const msg = await db.requestMessage.create({
    data: { requestId: r.id, authorName: "System", kind: "SYSTEM", body: `Entscheidung: ${outcome.label}\n\nBegründung: ${d.reason}${certNote}`, deliveryStatus: r.applicant.dmOptOut ? "NOT_SENT" : "PENDING" },
  });
  await audit("request.decide", {
    actorId: approver?.id ?? proposer.id,
    targetType: "request",
    targetId: r.id,
    meta: { outcome: outcome.key, proposer: proposer.id, approver: approver?.id ?? null, fourEyes: !!approver },
  });

  const jobIds: string[] = [];
  const dm = await dmApplicant(r.applicant, { publicId: r.publicId, typeTitle: r.type.title, title: `Entscheidung: ${outcome.label}`, body: `**Begründung:**\n${d.reason}${certNote}`, requestId: r.id }, msg.id);
  if (dm) jobIds.push(dm);
  else await db.requestMessage.update({ where: { id: msg.id }, data: { deliveryStatus: "NOT_SENT" } });

  const settings = await getSettings();
  const logChannel = env().DISCORD_LOG_CHANNEL_ID;
  if (settings["requests.logDecisions"] && logChannel && !r.isTest) {
    const who = approver ? `${name(proposer)} + ${name(approver)}` : name(proposer);
    const job = await enqueue({ type: "CHANNEL_MESSAGE", channelId: logChannel, kind: "log", message: buildLogLine(`⚖️ **${r.publicId}** (${r.type.title}) entschieden: **${outcome.label}** · ${who}`, { url: teamRequestUrl(r.id), tone: "brand" }) });
    jobIds.push(job.id);
  }
  return jobIds;
}
