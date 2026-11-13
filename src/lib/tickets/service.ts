/**
 * Ticket-Logik (serverseitig): Erstellen, Antworten, Status, Claim, Schließen,
 * Bewertung, Discord-Thread. Rechte werden HIER geprüft (zusätzlich zu Seiten/Actions).
 */
import type { Prisma, Sensitivity, Ticket, TicketPriority, TicketStatus, User } from "@prisma/client";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { nextPublicId } from "@/lib/ids";
import { UserError } from "@/lib/errors";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkSpam } from "@/lib/spam";
import { canReceiveTicket, sensitivityFor, teamCanSeeTicket, ticketMayUseDiscord, type Viewer } from "@/lib/perms";
import { categoryLabel, displayFields, fieldsSchema, getCategory } from "@/lib/tickets/categories";
import { ACTIVE_TICKET_STATUSES, TICKET_STATUS_EMOJI, TICKET_STATUS_LABEL, TICKET_STATUS_LABEL_TEAM, canTransition, statusAfterMessage } from "@/lib/tickets/status";
import { clipProvider } from "@/lib/uploads/links";
import { enqueue } from "@/lib/discord/outbox-db";
import { isTestDiscordId } from "@/lib/discord/outbox";
import { buildLogLine, buildMirrorMessage, buildThreadIntro, buildThreadNotice, buildTicketNoticeDm, buildTicketReplyDm, threadName } from "@/lib/discord/messages";
import { buildTranscript } from "@/lib/tickets/transcript";

export const displayName = (u: Pick<User, "globalName" | "username">) => u.globalName || u.username;
export const ticketUrl = (id: string) => `${publicEnv.appUrl}/tickets/${id}`;
export const teamTicketUrl = (id: string) => `${publicEnv.appUrl}/team/tickets/${id}`;

export const viewerOf = (user: Pick<User, "id" | "discordId">, teamLevel: Viewer["teamLevel"]): Viewer => ({ userId: user.id, discordId: user.discordId, teamLevel });

const MAX_BODY = 4000;

// ─── Laden mit Rechteprüfung ─────────────────────────────────

export async function loadTicketForTeam(viewer: Viewer, ticketId: string) {
  const t = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!t || !teamCanSeeTicket(viewer, t)) throw new UserError("Ticket nicht gefunden.");
  return t;
}

export async function loadTicketForPlayer(userId: string, ticketId: string) {
  const t = await db.ticket.findUnique({ where: { id: ticketId } });
  if (!t || t.creatorId !== userId) throw new UserError("Ticket nicht gefunden.");
  return t;
}

// ─── Anhänge ─────────────────────────────────────────────────

async function linkAttachments(tx: Prisma.TransactionClient, ownerId: string, target: { ticketId: string; ticketMessageId?: string }, attachmentIds: string[], links: string[]) {
  if (attachmentIds.length) {
    // Nur eigene, noch nicht zugeordnete Uploads
    await tx.attachment.updateMany({
      where: { id: { in: attachmentIds.slice(0, 5) }, ownerId, ticketId: null, requestId: null },
      data: { ticketId: target.ticketId, ticketMessageId: target.ticketMessageId ?? null },
    });
  }
  for (const url of links.slice(0, 5)) {
    const provider = clipProvider(url);
    if (!provider) continue;
    await tx.attachment.create({ data: { ownerId, kind: "LINK", url, provider, ticketId: target.ticketId, ticketMessageId: target.ticketMessageId ?? null } });
  }
}

// ─── Erstellen ───────────────────────────────────────────────

export interface CreateTicketInput {
  creator: User;
  category: string;
  subject: string;
  body: string;
  fields: Record<string, unknown>;
  source: "WEB" | "DISCORD";
  attachmentIds?: string[];
  links?: string[];
  /** Beschuldigte Teammitglieder (Portal-Nutzer-IDs aus der Auswahl) */
  accusedUserIds?: string[];
  /** Discord-Modal: Freitext für Datum/Uhrzeit */
  lenient?: boolean;
}

export async function createTicket(input: CreateTicketInput) {
  const category = getCategory(input.category);
  if (!category) throw new UserError("Unbekannte Kategorie.");
  const subject = input.subject.trim().slice(0, 140);
  const body = input.body.trim().slice(0, MAX_BODY);
  if (subject.length < 4) throw new UserError("Bitte gib einen kurzen Betreff an (mind. 4 Zeichen).");
  if (body.length < 10) throw new UserError("Beschreib dein Anliegen bitte etwas genauer (mind. 10 Zeichen).");
  const parsed = fieldsSchema(category, { lenient: input.lenient }).safeParse(input.fields);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? "Bitte prüf deine Angaben.");
  const fields = parsed.data as Record<string, unknown>;

  const settings = await getSettings();
  const open = await db.ticket.count({ where: { creatorId: input.creator.id, status: { in: ACTIVE_TICKET_STATUSES } } });
  if (open >= settings["tickets.maxOpen"]) {
    throw new UserError(`Du hast schon ${open} offene Tickets. Warte bitte, bis eins erledigt ist – oder schreib in ein bestehendes.`);
  }
  await enforceRateLimit(`ticket:create:${input.creator.id}`, 5, 3600);

  // Copy-Paste-Spam: eigene letzte Tickets + Wellen gleicher Texte
  const since = new Date(Date.now() - 24 * 3600_000);
  const [own, others] = await Promise.all([
    db.ticketMessage.findMany({ where: { authorId: input.creator.id, kind: "PLAYER", createdAt: { gte: since } }, select: { body: true }, take: 20, orderBy: { createdAt: "desc" } }),
    db.ticketMessage.findMany({ where: { kind: "PLAYER", createdAt: { gte: new Date(Date.now() - 15 * 60_000) }, NOT: { authorId: input.creator.id } }, select: { body: true }, take: 50 }),
  ]);
  const spam = checkSpam(body, { recentOwn: own.map((o) => o.body), recentOthers: others.map((o) => o.body), minLength: 10 });
  if (!spam.ok) throw new UserError(spam.reason);

  // Beschwerde über Teammitglieder: nur Personen mit Team-Stufe, als Discord-IDs speichern
  let accusedDiscordIds: string[] = [];
  if (category.key === "beschwerde" && fields.teamComplaint === true && input.accusedUserIds?.length) {
    const accused = await db.user.findMany({ where: { id: { in: input.accusedUserIds.slice(0, 5) }, teamLevel: { not: "NONE" } }, select: { discordId: true } });
    accusedDiscordIds = accused.map((a) => a.discordId).filter((id) => id !== input.creator.discordId);
  }
  const teamComplaint = category.key === "beschwerde" && fields.teamComplaint === true;
  if (teamComplaint && input.source === "DISCORD") throw new UserError("Beschwerden über Teammitglieder gehen nur im Portal.");
  const sensitivity: Sensitivity = teamComplaint ? "TEAM_COMPLAINT" : sensitivityFor(category.sensitivity, accusedDiscordIds);

  const links = [...(input.links ?? []), ...(typeof fields.clip === "string" && fields.clip ? [fields.clip] : [])];
  const publicId = await nextPublicId(env().TICKET_ID_PREFIX);
  const now = new Date();
  const ticket = await db.$transaction(async (tx) => {
    const t = await tx.ticket.create({
      data: {
        publicId,
        category: category.key,
        subject,
        fields: fields as Prisma.InputJsonValue,
        source: input.source,
        creatorId: input.creator.id,
        sensitivity,
        accusedDiscordIds,
        lastPlayerAt: now,
        isTest: input.creator.isTest,
      },
    });
    const msg = await tx.ticketMessage.create({
      data: { ticketId: t.id, authorId: input.creator.id, authorName: displayName(input.creator), authorDiscordId: input.creator.discordId, kind: "PLAYER", body, source: input.source },
    });
    await linkAttachments(tx, input.creator.id, { ticketId: t.id, ticketMessageId: msg.id }, input.attachmentIds ?? [], links);
    await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: input.creator.id, actorName: displayName(input.creator), type: "created", to: "OPEN" } });
    return t;
  });
  await audit("ticket.create", { actorId: input.creator.id, targetType: "ticket", targetId: ticket.id, meta: { publicId, category: category.key, source: input.source } });

  // Log-Channel (sensible Tickets ohne Details)
  const logChannel = env().DISCORD_LOG_CHANNEL_ID;
  const jobIds: string[] = [];
  if (logChannel && !ticket.isTest) {
    const line = sensitivity === "NORMAL" ? `🎫 Neues Ticket **${publicId}** · ${categoryLabel(category.key)} · ${subject.replace(/[*_`]/g, "")}` : `🔒 Neues vertrauliches Ticket **${publicId}** (nur Moderation/Leitung)`;
    jobIds.push((await enqueue({ type: "CHANNEL_MESSAGE", channelId: logChannel, message: buildLogLine(line, { url: teamTicketUrl(ticket.id) }), kind: "log" })).id);
  }
  return { ticket, jobIds };
}

// ─── Discord-Thread ──────────────────────────────────────────

/**
 * Privaten Thread zum Ticket anlegen (idempotent). Ohne Worker: wird direkt nach
 * dem Erstellen aufgerufen und von den Hintergrundarbeiten wiederholt, falls es scheitert.
 */
export async function ensureDiscordThread(ticketId: string): Promise<string | null> {
  const e = env();
  const settings = await getSettings();
  if (!settings["tickets.discordEnabled"] || !e.DISCORD_TICKET_CHANNEL_ID || !e.DISCORD_BOT_TOKEN) return null;
  const t = await db.ticket.findUnique({ where: { id: ticketId }, include: { creator: true, messages: { orderBy: { createdAt: "asc" }, take: 1 } } });
  if (!t || t.discordThreadId || !ticketMayUseDiscord(t) || t.status === "CLOSED" || t.isTest || isTestDiscordId(t.creator.discordId)) return t?.discordThreadId ?? null;
  // Sperre gegen doppeltes Anlegen (parallele Aufrufe)
  const lock = await db.ticket.updateMany({ where: { id: ticketId, discordThreadId: null, discordChannelId: null }, data: { discordChannelId: e.DISCORD_TICKET_CHANNEL_ID } });
  if (!lock.count) return null;
  const { getDiscordApi } = await import("@/lib/discord/client");
  const api = getDiscordApi();
  try {
    const cat = getCategory(t.category);
    const threadId = await api.createPrivateThread(e.DISCORD_TICKET_CHANNEL_ID, threadName(TICKET_STATUS_EMOJI[t.status], t.publicId, cat?.short ?? t.category, displayName(t.creator)));
    await db.ticket.update({ where: { id: t.id }, data: { discordThreadId: threadId, lastSyncAt: new Date() } });
    await api.addThreadMember(threadId, t.creator.discordId).catch(() => {}); // nicht auf dem Server → egal
    const introId = await api.postMessage(
      threadId,
      buildThreadIntro({
        ticketId: t.id,
        publicId: t.publicId,
        categoryLabel: cat?.label ?? t.category,
        subject: t.subject,
        body: t.messages[0]?.body ?? "",
        fields: displayFields(t.category, t.fields),
        playerDiscordId: t.creator.discordId,
        portalUrl: ticketUrl(t.id),
        source: t.source,
      }),
    );
    await db.syncedDiscordMessage.create({ data: { id: introId, ticketId: t.id } }).catch(() => {});
    await db.ticket.update({ where: { id: t.id }, data: { lastSyncedMessageId: introId } });
    return threadId;
  } catch (err) {
    console.error("[tickets] Thread konnte nicht angelegt werden", t.publicId, err);
    await db.ticket.updateMany({ where: { id: t.id, discordThreadId: null }, data: { discordChannelId: null } });
    return null;
  }
}

async function mirrorToThread(t: Pick<Ticket, "id" | "discordThreadId" | "status">, message: Parameters<typeof buildMirrorMessage>[0] | { notice: string }, ticketMessageId?: string) {
  if (!t.discordThreadId) return null;
  const msg = "notice" in message ? buildThreadNotice(message.notice) : buildMirrorMessage(message);
  const job = await enqueue({ type: "THREAD_MESSAGE", threadId: t.discordThreadId, message: msg, unarchive: t.status === "CLOSED" || t.status === "RESOLVED" }, { ticketId: t.id, ticketMessageId });
  return job.id;
}

async function renameThread(t: Ticket & { creator: Pick<User, "globalName" | "username"> }, status: TicketStatus, extra: { archived?: boolean; locked?: boolean } = {}) {
  if (!t.discordThreadId) return null;
  const cat = getCategory(t.category);
  const job = await enqueue({ type: "THREAD_UPDATE", threadId: t.discordThreadId, name: threadName(TICKET_STATUS_EMOJI[status], t.publicId, cat?.short ?? t.category, displayName(t.creator)), ...extra }, { ticketId: t.id });
  return job.id;
}

// ─── Nachrichten ─────────────────────────────────────────────

export async function addPlayerMessage(input: { user: User; ticketId: string; body: string; attachmentIds?: string[]; links?: string[]; source?: "WEB" | "DISCORD" }) {
  const t = await loadTicketForPlayer(input.user.id, input.ticketId);
  if (t.status === "CLOSED") throw new UserError("Das Ticket ist geschlossen. Mach bei Bedarf ein neues auf.");
  const body = input.body.trim().slice(0, MAX_BODY);
  await enforceRateLimit(`ticket:msg:${input.user.id}`, 20, 600);
  const own = await db.ticketMessage.findMany({ where: { authorId: input.user.id, createdAt: { gte: new Date(Date.now() - 3600_000) } }, select: { body: true }, take: 10, orderBy: { createdAt: "desc" } });
  const spam = checkSpam(body, { recentOwn: own.map((o) => o.body) });
  if (!spam.ok) throw new UserError(spam.reason);

  const now = new Date();
  const next = statusAfterMessage(t.status, "PLAYER");
  const msg = await db.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({
      data: { ticketId: t.id, authorId: input.user.id, authorName: displayName(input.user), authorDiscordId: input.user.discordId, kind: "PLAYER", body, source: input.source ?? "WEB" },
    });
    await linkAttachments(tx, input.user.id, { ticketId: t.id, ticketMessageId: m.id }, input.attachmentIds ?? [], input.links ?? []);
    await tx.ticket.update({ where: { id: t.id }, data: { status: next, lastPlayerAt: now, waitingSince: null, autoCloseWarnedAt: null } });
    if (next !== t.status) await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: input.user.id, actorName: displayName(input.user), type: "status", from: t.status, to: next } });
    return m;
  });
  const jobIds: string[] = [];
  if ((input.source ?? "WEB") === "WEB") {
    const links = await db.attachment.findMany({ where: { ticketMessageId: msg.id }, select: { id: true, kind: true, url: true } });
    const j = await mirrorToThread(t, { authorName: displayName(input.user), role: "Spieler", body, attachments: links.map((a) => (a.kind === "LINK" ? a.url! : `${publicEnv.appUrl}/api/uploads/${a.id}`)) }, msg.id);
    if (j) jobIds.push(j);
  }
  return { message: msg, jobIds };
}

export async function addTeamMessage(input: { viewer: Viewer; actor: User; ticketId: string; body: string; internal?: boolean; attachmentIds?: string[]; links?: string[]; setStatus?: TicketStatus | null }) {
  const t = await loadTicketForTeam(input.viewer, input.ticketId);
  const body = input.body.trim().slice(0, MAX_BODY);
  if (body.length < 2) throw new UserError("Die Nachricht ist leer.");
  if (!input.internal && t.status === "CLOSED") throw new UserError("Das Ticket ist geschlossen. Öffne es erst wieder.");
  const now = new Date();
  const settings = await getSettings();
  const creator = await db.user.findUniqueOrThrow({ where: { id: t.creatorId } });
  const wantsDm = !input.internal && settings["tickets.dmOnReply"] && !creator.dmOptOut && !isTestDiscordId(creator.discordId);
  let next: TicketStatus = input.internal ? t.status : statusAfterMessage(t.status, "TEAM");
  if (input.setStatus && !input.internal) next = input.setStatus;

  const msg = await db.$transaction(async (tx) => {
    const m = await tx.ticketMessage.create({
      data: {
        ticketId: t.id,
        authorId: input.actor.id,
        authorName: displayName(input.actor),
        authorDiscordId: input.actor.discordId,
        kind: input.internal ? "INTERNAL" : "TEAM",
        body,
        source: "WEB",
        deliveryStatus: wantsDm ? "PENDING" : "NOT_SENT",
      },
    });
    await linkAttachments(tx, input.actor.id, { ticketId: t.id, ticketMessageId: m.id }, input.attachmentIds ?? [], input.links ?? []);
    if (!input.internal) {
      await tx.ticket.update({
        where: { id: t.id },
        data: {
          status: next,
          lastTeamAt: now,
          firstResponseAt: t.firstResponseAt ?? now,
          waitingSince: next === "WAITING_PLAYER" ? now : null,
          autoCloseWarnedAt: null,
          ...(next === "RESOLVED" ? { resolvedAt: now } : {}),
          // Wer antwortet und noch niemand betreut: automatisch übernehmen
          ...(t.claimedById ? {} : { claimedById: input.actor.id }),
        },
      });
      if (next !== t.status) await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: "status", from: t.status, to: next } });
      if (!t.claimedById) await tx.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: "claim", to: displayName(input.actor) } });
    }
    return m;
  });
  await audit(input.internal ? "ticket.note" : "ticket.reply", { actorId: input.actor.id, targetType: "ticket", targetId: t.id });

  const jobIds: string[] = [];
  if (!input.internal) {
    const atts = await db.attachment.findMany({ where: { ticketMessageId: msg.id }, select: { id: true, kind: true, url: true } });
    const j = await mirrorToThread(t, { authorName: displayName(input.actor), role: "Team", body, attachments: atts.map((a) => (a.kind === "LINK" ? a.url! : `${publicEnv.appUrl}/api/uploads/${a.id}`)) }, msg.id);
    if (j) jobIds.push(j);
    if (wantsDm) {
      const dm = await enqueue(
        { type: "DM", discordUserId: creator.discordId, purpose: "ticket_reply", message: buildTicketReplyDm({ publicId: t.publicId, subject: t.subject, authorName: displayName(input.actor), body, url: ticketUrl(t.id) }) },
        { ticketMessageId: msg.id, ticketId: t.id },
      );
      jobIds.push(dm.id);
    }
    if (next !== t.status) {
      const r = await renameThread({ ...t, creator }, next);
      if (r) jobIds.push(r);
    }
  }
  return { message: msg, jobIds };
}

// ─── Status, Claim, Priorität ────────────────────────────────

export async function changeStatus(input: { viewer: Viewer; actor: User; ticketId: string; to: TicketStatus; reason?: string }) {
  const t = await loadTicketForTeam(input.viewer, input.ticketId);
  if (!canTransition(t.status, input.to)) throw new UserError("Dieser Statuswechsel geht nicht.");
  if (input.to === "CLOSED") return closeTicket({ ticketId: t.id, actor: input.actor, reason: input.reason ?? "Vom Team geschlossen" });
  const now = new Date();
  const creator = await db.user.findUniqueOrThrow({ where: { id: t.creatorId } });
  await db.$transaction([
    db.ticket.update({
      where: { id: t.id },
      data: {
        status: input.to,
        waitingSince: input.to === "WAITING_PLAYER" ? now : null,
        autoCloseWarnedAt: null,
        ...(input.to === "RESOLVED" ? { resolvedAt: now } : {}),
        ...(input.to === "OPEN" ? { closedAt: null, closedReason: null, resolvedAt: null } : {}),
      },
    }),
    db.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: "status", from: t.status, to: input.to } }),
    db.ticketMessage.create({
      data: { ticketId: t.id, authorId: input.actor.id, authorName: displayName(input.actor), kind: "SYSTEM", body: `Status: ${TICKET_STATUS_LABEL[input.to]}` },
    }),
  ]);
  await audit("ticket.status", { actorId: input.actor.id, targetType: "ticket", targetId: t.id, meta: { from: t.status, to: input.to } });
  const jobIds: string[] = [];
  const n = await mirrorToThread(t, { notice: `${displayName(input.actor)} hat den Status auf „${TICKET_STATUS_LABEL_TEAM[input.to]}“ gesetzt.` });
  if (n) jobIds.push(n);
  const r = await renameThread({ ...t, creator }, input.to, input.to === "OPEN" ? { archived: false, locked: false } : {});
  if (r) jobIds.push(r);
  if (input.to === "RESOLVED") {
    const settings = await getSettings();
    if (settings["tickets.dmOnReply"] && !creator.dmOptOut && !isTestDiscordId(creator.discordId)) {
      const dm = await enqueue({
        type: "DM",
        discordUserId: creator.discordId,
        purpose: "ticket_status",
        message: buildTicketNoticeDm({
          publicId: t.publicId,
          title: "Dein Ticket ist gelöst",
          body: `Wir haben dein Ticket als gelöst markiert. Passt alles? Dann musst du nichts tun – es wird in ${settings["tickets.resolvedCloseDays"]} Tag(en) geschlossen. Wenn nicht, antworte einfach im Portal.`,
          url: ticketUrl(t.id),
        }),
      });
      jobIds.push(dm.id);
    }
  }
  return { jobIds };
}

export async function claimTicket(input: { viewer: Viewer; actor: User; ticketId: string; action: "claim" | "release" }) {
  const t = await loadTicketForTeam(input.viewer, input.ticketId);
  if (input.action === "claim") {
    if (t.claimedById === input.actor.id) throw new UserError("Du betreust das Ticket schon.");
    // Atomar: nur übernehmen, wenn es noch frei ist (oder von dir)
    const r = await db.ticket.updateMany({ where: { id: t.id, claimedById: null }, data: { claimedById: input.actor.id, ...(t.status === "OPEN" ? { status: "IN_PROGRESS" } : {}) } });
    if (!r.count) throw new UserError("Das Ticket betreut schon jemand. Bitte um Weitergabe.");
  } else {
    if (t.claimedById !== input.actor.id && input.viewer.teamLevel === "SUPPORT") throw new UserError("Nur wer betreut (oder Moderation/Leitung) kann freigeben.");
    await db.ticket.update({ where: { id: t.id }, data: { claimedById: null } });
  }
  await db.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: input.action, to: input.action === "claim" ? displayName(input.actor) : null } });
  await audit(input.action === "claim" ? "ticket.claim" : "ticket.release", { actorId: input.actor.id, targetType: "ticket", targetId: t.id });
  const jobIds: string[] = [];
  const n = await mirrorToThread(t, { notice: input.action === "claim" ? `📌 ${displayName(input.actor)} kümmert sich um dieses Ticket.` : `${displayName(input.actor)} hat das Ticket freigegeben.` });
  if (n) jobIds.push(n);
  return { jobIds };
}

export async function transferTicket(input: { viewer: Viewer; actor: User; ticketId: string; toUserId: string }) {
  const t = await loadTicketForTeam(input.viewer, input.ticketId);
  const target = await db.user.findUnique({ where: { id: input.toUserId } });
  if (!target || target.teamLevel === "NONE") throw new UserError("Diese Person ist nicht im Team.");
  if (!canReceiveTicket({ userId: target.id, discordId: target.discordId, teamLevel: target.teamLevel }, t)) {
    throw new UserError("Diese Person darf das Ticket nicht sehen (Stufe oder Beschwerde gegen sie).");
  }
  await db.ticket.update({ where: { id: t.id }, data: { claimedById: target.id } });
  await db.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: "transfer", from: displayName(input.actor), to: displayName(target) } });
  await audit("ticket.transfer", { actorId: input.actor.id, targetType: "ticket", targetId: t.id, meta: { to: target.id } });
  const n = await mirrorToThread(t, { notice: `${displayName(input.actor)} hat das Ticket an ${displayName(target)} weitergegeben.` });
  return { jobIds: n ? [n] : [] };
}

export async function updateTicketMeta(input: { viewer: Viewer; actor: User; ticketId: string; priority?: TicketPriority; tags?: string[]; accusedUserIds?: string[]; sensitivity?: Sensitivity }) {
  const t = await loadTicketForTeam(input.viewer, input.ticketId);
  const data: Prisma.TicketUpdateInput = {};
  if (input.priority && input.priority !== t.priority) {
    data.priority = input.priority;
    await db.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor.id, actorName: displayName(input.actor), type: "priority", from: t.priority, to: input.priority } });
    await audit("ticket.priority", { actorId: input.actor.id, targetType: "ticket", targetId: t.id, meta: { to: input.priority } });
  }
  if (input.tags) {
    data.tags = [...new Set(input.tags.map((x) => x.trim().toLowerCase().slice(0, 24)).filter(Boolean))].slice(0, 10);
    await audit("ticket.tags", { actorId: input.actor.id, targetType: "ticket", targetId: t.id });
  }
  if (input.accusedUserIds || input.sensitivity) {
    // Nur Moderation/Leitung darf Sichtbarkeit/Beschuldigte ändern
    if (input.viewer.teamLevel === "SUPPORT") throw new UserError("Sichtbarkeit ändern darf nur Moderation/Leitung.");
    if (input.accusedUserIds) {
      const accused = await db.user.findMany({ where: { id: { in: input.accusedUserIds.slice(0, 5) }, teamLevel: { not: "NONE" } }, select: { discordId: true } });
      data.accusedDiscordIds = accused.map((a) => a.discordId);
      if (accused.length) data.sensitivity = "TEAM_COMPLAINT";
      // Wer jetzt beschuldigt ist, darf das Ticket nicht mehr betreuen
      if (t.claimedById) {
        const claimer = await db.user.findUnique({ where: { id: t.claimedById }, select: { discordId: true } });
        if (claimer && data.accusedDiscordIds.includes(claimer.discordId)) data.claimedBy = { disconnect: true };
      }
    }
    if (input.sensitivity) data.sensitivity = input.sensitivity;
    await audit("ticket.sensitivity", { actorId: input.actor.id, targetType: "ticket", targetId: t.id, meta: { sensitivity: input.sensitivity ?? null } });
  }
  await db.ticket.update({ where: { id: t.id }, data });
  // Wurde das Ticket vertraulich, darf es nicht mehr im (für Mods sichtbaren) Thread weiterlaufen
  const after = await db.ticket.findUniqueOrThrow({ where: { id: t.id } });
  const jobIds: string[] = [];
  if (after.discordThreadId && !ticketMayUseDiscord(after)) {
    const n = await mirrorToThread(after, { notice: "Dieses Ticket läuft ab jetzt nur noch im Portal weiter." });
    if (n) jobIds.push(n);
    jobIds.push((await enqueue({ type: "THREAD_UPDATE", threadId: after.discordThreadId, archived: true, locked: true }, { ticketId: t.id })).id);
    await db.ticket.update({ where: { id: t.id }, data: { discordThreadId: null } });
  }
  return { jobIds };
}

// ─── Schließen & Bewerten ────────────────────────────────────

export async function closeTicket(input: { ticketId: string; actor: User | null; reason: string; byPlayer?: boolean }) {
  const t = await db.ticket.findUniqueOrThrow({ where: { id: input.ticketId }, include: { creator: true } });
  if (t.status === "CLOSED") return { jobIds: [] as string[] };
  const now = new Date();
  const transcript = await buildTranscript(t.id);
  const actorName = input.actor ? displayName(input.actor) : "System";
  await db.$transaction([
    db.ticket.update({ where: { id: t.id }, data: { status: "CLOSED", closedAt: now, closedReason: input.reason.slice(0, 200), transcript, waitingSince: null } }),
    db.ticketEvent.create({ data: { ticketId: t.id, actorId: input.actor?.id ?? null, actorName, type: "status", from: t.status, to: "CLOSED" } }),
    db.ticketMessage.create({ data: { ticketId: t.id, authorId: input.actor?.id ?? null, authorName: actorName, kind: "SYSTEM", body: `Geschlossen: ${input.reason}` } }),
  ]);
  if (input.actor && !input.byPlayer) await audit("ticket.status", { actorId: input.actor.id, targetType: "ticket", targetId: t.id, meta: { to: "CLOSED", reason: input.reason } });
  const jobIds: string[] = [];
  const n = await mirrorToThread(t, { notice: `🔒 Ticket geschlossen (${input.reason}). Das Transkript liegt im Portal.` });
  if (n) jobIds.push(n);
  const r = await renameThread(t, "CLOSED", { archived: true, locked: true });
  if (r) jobIds.push(r);
  if (!input.byPlayer && !t.creator.dmOptOut && !isTestDiscordId(t.creator.discordId)) {
    const dm = await enqueue({
      type: "DM",
      discordUserId: t.creator.discordId,
      purpose: "ticket_status",
      message: buildTicketNoticeDm({
        publicId: t.publicId,
        title: "Dein Ticket ist geschlossen",
        body: `Grund: ${input.reason}\nWie zufrieden warst du? Ein Klick reicht – oder bewerte im Portal mit Kommentar.`,
        url: ticketUrl(t.id),
        rate: env().DISCORD_BOT_TOKEN ? { ticketId: t.id } : null,
      }),
    });
    jobIds.push(dm.id);
  }
  return { jobIds };
}

export async function closeByPlayer(user: User, ticketId: string) {
  const t = await loadTicketForPlayer(user.id, ticketId);
  if (t.status === "CLOSED") throw new UserError("Das Ticket ist schon geschlossen.");
  return closeTicket({ ticketId: t.id, actor: user, reason: "Vom Spieler geschlossen", byPlayer: true });
}

export async function rateTicket(user: Pick<User, "id">, ticketId: string, rating: number, comment?: string) {
  const t = await loadTicketForPlayer(user.id, ticketId);
  if (t.status !== "CLOSED") throw new UserError("Bewerten kannst du, sobald das Ticket geschlossen ist.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new UserError("Bitte 1 bis 5 Sterne.");
  if (t.ratedAt && Date.now() - t.ratedAt.getTime() > 7 * 86_400_000) throw new UserError("Die Bewertung lässt sich nach einer Woche nicht mehr ändern.");
  await db.ticket.update({ where: { id: t.id }, data: { rating, ratingComment: comment?.trim().slice(0, 1000) || null, ratedAt: new Date() } });
}

/** Ticket für Zusammenfassungen/Listen: wer sieht was (Team-Liste) */
export function teamStatusLabel(s: TicketStatus) {
  return TICKET_STATUS_LABEL_TEAM[s];
}
