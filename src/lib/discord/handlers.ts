/**
 * Bearbeitung der Support-Interaktionen (Knöpfe, Auswahl, Modals, Befehle).
 * Rechte kommen aus der signierten Interaktion (member.roles) – Discord kann
 * sie nicht fälschen. Gleiche Regeln wie im Portal (lib/perms.ts).
 */
import { after } from "next/server";
import type { User } from "@prisma/client";
import { db } from "@/lib/db";
import { env, publicEnv } from "@/lib/env";
import { levelFromRoles } from "@/lib/auth/access";
import { toActionError } from "@/lib/errors";
import { normalizePublicId } from "@/lib/ids";
import { snowflakeToDate } from "@/lib/discord/snowflake";
import { teamCanSeeTicket, type Viewer } from "@/lib/perms";
import { TICKET_CATEGORIES, getCategory } from "@/lib/tickets/categories";
import { TICKET_STATUS_LABEL } from "@/lib/tickets/status";
import { REQUEST_STATUS_LABEL } from "@/lib/requests/model";
import { runOutbox } from "@/lib/discord/outbox-db";
import { deferredEphemeral, editOriginal, ephemeral, ids, modal, modalValue, parseCustomId, textInput, type SupportAction } from "@/lib/discord/interactions";
import { buildPanelMessage } from "@/lib/discord/messages";

export interface Interaction {
  type: number;
  id: string;
  application_id: string;
  token: string;
  guild_id?: string;
  channel_id?: string;
  data?: {
    name?: string;
    custom_id?: string;
    values?: string[];
    options?: { name: string; type: number; value?: string | number | boolean; options?: { name: string; value?: string | number | boolean }[] }[];
    components?: unknown[];
  };
  member?: { roles: string[]; user: DiscordUser };
  user?: DiscordUser;
}

interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

const json = (body: unknown) => Response.json(body);
const ticketLink = (id: string) => `${publicEnv.appUrl}/tickets/${id}`;

/** Discord-Nutzer ↔ Portal-Konto (wird bei Bedarf angelegt) */
async function userOf(i: Interaction): Promise<User | null> {
  const u = i.member?.user ?? i.user;
  if (!u) return null;
  return db.user.upsert({
    where: { discordId: u.id },
    create: { discordId: u.id, username: u.username, globalName: u.global_name ?? null, avatar: u.avatar ?? null, discordCreatedAt: snowflakeToDate(u.id), inGuild: !!i.member },
    update: { username: u.username, globalName: u.global_name ?? null, avatar: u.avatar ?? null },
  });
}

function levelOf(i: Interaction) {
  const e = env();
  if (!i.member || i.guild_id !== e.DISCORD_GUILD_ID) return "NONE" as const;
  return levelFromRoles(i.member.roles, { supportRoleId: e.SUPPORT_ROLE_ID, moderationRoleId: e.MODERATION_ROLE_ID, leitungRoleId: e.LEITUNG_ROLE_ID });
}

const viewerFrom = (user: User, i: Interaction): Viewer => ({ userId: user.id, discordId: user.discordId, teamLevel: levelOf(i) });

function categorySelect() {
  return ephemeral("Worum geht es? Wähl eine Kategorie – danach öffnet sich ein Formular.", [
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: ids.categorySelect,
          placeholder: "Kategorie wählen …",
          options: TICKET_CATEGORIES.map((c) => ({ label: c.label, value: c.key, description: c.description.slice(0, 100) })),
        },
      ],
    },
  ]);
}

function categoryModal(categoryKey: string) {
  const cat = getCategory(categoryKey);
  if (!cat) return ephemeral("Unbekannte Kategorie.");
  const rows = [
    textInput("subject", "Betreff", { required: true, min: 4, max: 140, placeholder: "Kurz und knapp" }),
    ...cat.discordFields.slice(0, 3).map((f) => textInput(f.key, f.label, { style: f.style, required: f.required, max: f.max, placeholder: f.placeholder })),
    textInput("body", "Beschreibung", { style: 2, required: true, min: 10, max: 2000, placeholder: "Was ist passiert? Was hast du schon probiert?" }),
  ];
  return modal(ids.newTicket(cat.key), `Ticket: ${cat.short}`, rows);
}

async function requestLinks(user: User | null) {
  const banned = !!user && (await db.user.findUnique({ where: { id: user.id }, select: { guildBanned: true } }))?.guildBanned;
  const types = await db.requestType.findMany({ where: { active: true, ...(banned ? { allowedWhenBanned: true } : {}) }, orderBy: { order: "asc" }, take: 20 });
  const own = user ? await db.request.findMany({ where: { applicantId: user.id, status: { in: ["SUBMITTED", "IN_REVIEW", "QUESTION"] } }, include: { type: { select: { title: true } } }, take: 5 }) : [];
  const buttons = types.map((t) => ({ type: 2, style: 5, label: t.title.slice(0, 80), url: `${publicEnv.appUrl}/antraege/neu/${t.slug}` }));
  const rows = [];
  for (let k = 0; k < buttons.length && rows.length < 4; k += 5) rows.push({ type: 1, components: buttons.slice(k, k + 5) });
  rows.push({ type: 1, components: [{ type: 2, style: 5, label: "Meine Anträge", url: `${publicEnv.appUrl}/antraege` }] });
  const status = own.length ? `\n\n**Deine offenen Anträge:**\n${own.map((r) => `- ${r.type.title} \`${r.publicId}\` – ${REQUEST_STATUS_LABEL[r.status]}`).join("\n")}` : "";
  return ephemeral(
    `Anträge füllst du immer im Portal aus (Login mit Discord) – dort siehst du auch Rückfragen und die Entscheidung mit Begründung.${status}`,
    rows,
  );
}

async function findTicketForTeam(viewer: Viewer, raw: string) {
  const publicId = normalizePublicId(raw, env().TICKET_ID_PREFIX);
  const t = publicId ? await db.ticket.findUnique({ where: { publicId } }) : null;
  return t && teamCanSeeTicket(viewer, t) ? t : null;
}

export async function handleCommand(i: Interaction): Promise<Response> {
  const name = i.data?.name;
  const user = await userOf(i);
  if (!user) return json(ephemeral("Das hat nicht geklappt."));

  if (name === "antrag") return json(await requestLinks(user));

  if (name === "support-panel") {
    if (levelOf(i) !== "LEITUNG") return json(ephemeral("Das darf nur die Leitung."));
    if (!i.channel_id) return json(ephemeral("Kein Channel."));
    try {
      const { getDiscordApi } = await import("@/lib/discord/client");
      await getDiscordApi().postMessage(i.channel_id, buildPanelMessage({ helpUrl: publicEnv.appUrl, requestsUrl: `${publicEnv.appUrl}/antraege` }));
      return json(ephemeral("✅ Panel gepostet. Tickets landen im Portal, Antworten gehen per DM raus."));
    } catch (e) {
      return json(ephemeral(`Konnte nicht posten: ${(e as Error).message}`));
    }
  }

  if (name === "ticket") {
    const sub = i.data?.options?.[0];
    if (sub?.name === "neu") return json(categorySelect());
    if (sub?.name === "status") {
      const own = await db.ticket.findMany({ where: { creatorId: user.id, status: { not: "CLOSED" } }, orderBy: { updatedAt: "desc" }, take: 5 });
      if (!own.length) return json(ephemeral(`Du hast gerade keine offenen Tickets. Neues Ticket: \`/ticket neu\` oder ${publicEnv.appUrl}/tickets/neu`));
      return json(ephemeral(`**Deine offenen Tickets:**\n${own.map((t) => `- \`${t.publicId}\` ${t.subject.replace(/[*_`]/g, "")} – ${TICKET_STATUS_LABEL[t.status]} · ${ticketLink(t.id)}`).join("\n")}\n-# Alle: ${publicEnv.appUrl}/dashboard`));
    }
    if (sub?.name === "claim") {
      const viewer = viewerFrom(user, i);
      if (viewer.teamLevel === "NONE") return json(ephemeral("Das geht nur fürs Team."));
      const raw = sub.options?.find((o) => o.name === "id")?.value;
      if (!raw) return json(ephemeral("Bitte gib eine Ticket-ID an, z. B. `/ticket claim id:NVS-2026-0012`."));
      const t = await findTicketForTeam(viewer, String(raw));
      if (!t) return json(ephemeral("Ticket nicht gefunden (oder du darfst es nicht sehen)."));
      return json(ephemeral(await claimText(user, viewer, t.id)));
    }
  }
  return json(ephemeral("Diesen Befehl kenne ich nicht."));
}

async function claimText(user: User, viewer: Viewer, ticketId: string) {
  try {
    const { claimTicket } = await import("@/lib/tickets/service");
    const { jobIds } = await claimTicket({ viewer, actor: user, ticketId, action: "claim" });
    if (jobIds.length) after(() => runOutbox({ ids: jobIds }).catch(() => {}));
    return `📌 Du betreust das Ticket jetzt. ${publicEnv.appUrl}/team/tickets/${ticketId}`;
  } catch (e) {
    return toActionError(e).error;
  }
}

export async function handleComponent(i: Interaction): Promise<Response> {
  const action = parseCustomId(i.data?.custom_id ?? "");
  if (!action) return json(ephemeral("Dieser Knopf ist veraltet."));
  if (action.kind === "panelTicket") return json(categorySelect());
  if (action.kind === "categorySelect") {
    const cat = i.data?.values?.[0] ?? "";
    return json(categoryModal(cat));
  }
  const user = await userOf(i);
  if (!user) return json(ephemeral("Das hat nicht geklappt."));
  if (action.kind === "panelRequest") return json(await requestLinks(user));
  return handleTicketAction(user, action);
}

/** Einziger Ticket-Knopf in Discord: Bewertung aus der DM nach dem Schließen */
async function handleTicketAction(user: User, action: SupportAction): Promise<Response> {
  if (action.kind !== "rate") return json(ephemeral("Dieser Knopf ist veraltet – Tickets laufen im Portal."));
  const t = await db.ticket.findUnique({ where: { id: action.ticketId } });
  if (!t || t.creatorId !== user.id) return json(ephemeral("Bewerten kann nur, wer das Ticket erstellt hat."));
  try {
    const { rateTicket } = await import("@/lib/tickets/service");
    await rateTicket(user, t.id, action.stars);
    return json(ephemeral(`Danke für deine Bewertung (${"★".repeat(action.stars)})! Einen Kommentar kannst du im Portal ergänzen: ${ticketLink(t.id)}`));
  } catch (e) {
    return json(ephemeral(toActionError(e).error));
  }
}

export async function handleModal(i: Interaction): Promise<Response> {
  const action = parseCustomId(i.data?.custom_id ?? "");
  if (!action) return json(ephemeral("Dieses Formular ist veraltet."));
  const user = await userOf(i);
  if (!user) return json(ephemeral("Das hat nicht geklappt."));

  if (action.kind === "newTicket") {
    const cat = getCategory(action.category);
    if (!cat) return json(ephemeral("Unbekannte Kategorie."));
    const data = i.data;
    const fields: Record<string, unknown> = {};
    for (const f of cat.discordFields) fields[f.key] = modalValue(data, f.key);
    const subject = modalValue(data, "subject");
    const body = modalValue(data, "body");
    // Datenbank + Log-Post können länger als Discords 3-Sekunden-Grenze dauern → verzögert antworten
    after(async () => {
      let content: string;
      try {
        if (user.guildBanned) throw new Error("Solange du gebannt bist, ist nur ein Entbannungsantrag möglich.");
        const { createTicket } = await import("@/lib/tickets/service");
        const { ticket, jobIds } = await createTicket({ creator: user, category: cat.key, subject, body, fields, source: "DISCORD", lenient: true });
        await runOutbox({ ids: jobIds }).catch(() => {});
        content = `✅ Ticket **${ticket.publicId}** ist da. Antworten vom Team bekommst du per DM – weiter geht's im Portal: ${ticketLink(ticket.id)}`;
      } catch (e) {
        const msg = e instanceof Error && e.name === "UserError" ? e.message : toActionError(e).error;
        content = `❌ ${msg}`;
      }
      await editOriginal(i.application_id, i.token, { content });
    });
    return json(deferredEphemeral());
  }

  return json(ephemeral("Unbekanntes Formular."));
}
