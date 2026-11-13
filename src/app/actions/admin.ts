"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { assertTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { saveSettings, SETTINGS_SCHEMA } from "@/lib/settings";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";
import { FieldDefSchema, OutcomeSchema } from "@/lib/requests/model";

const lead = () => assertTeam("LEITUNG");

export async function saveSettingsAction(patch: Record<string, unknown>): Promise<ActionResult> {
  try {
    const { user } = await lead();
    const parsed = SETTINGS_SCHEMA.partial().safeParse(patch);
    if (!parsed.success) throw new UserError(`Ungültig: ${parsed.error.issues[0]?.path.join(".")} – ${parsed.error.issues[0]?.message}`);
    await saveSettings(parsed.data);
    await audit("settings.update", { actorId: user.id, meta: { keys: Object.keys(parsed.data) } });
    revalidatePath("/team/admin");
    return { ok: true, message: "Gespeichert." };
  } catch (e) {
    return toActionError(e);
  }
}

export async function registerCommandsAction(): Promise<ActionResult> {
  try {
    const { user } = await lead();
    const { registerCommands } = await import("@/lib/discord/setup");
    const done = await registerCommands();
    await audit("discord.setup", { actorId: user.id, meta: { commands: done } });
    return { ok: true, message: `Registriert: ${done.join(", ")}. Die Befehle des Bewerbungsportals bleiben unberührt.` };
  } catch (e) {
    return e instanceof Error && !(e instanceof UserError) ? { ok: false, error: e.message } : toActionError(e);
  }
}

export async function setInteractionsUrlAction(): Promise<ActionResult> {
  try {
    const { user } = await lead();
    if (!env().INTERACTIONS_FORWARD_URL) {
      throw new UserError("Erst INTERACTIONS_FORWARD_URL setzen (Bewerbungsportal), sonst funktionieren dessen Knöpfe nicht mehr.");
    }
    const { setInteractionsUrl } = await import("@/lib/discord/setup");
    const url = await setInteractionsUrl();
    await audit("discord.setup", { actorId: user.id, meta: { interactionsUrl: url } });
    return { ok: true, message: `Interactions-URL gesetzt: ${url}. Fremde Interaktionen gehen weiter an ${env().INTERACTIONS_FORWARD_URL}.` };
  } catch (e) {
    return e instanceof Error && !(e instanceof UserError) ? { ok: false, error: e.message } : toActionError(e);
  }
}

export async function postPanelAction(): Promise<ActionResult> {
  try {
    const { user } = await lead();
    const channel = env().DISCORD_TICKET_CHANNEL_ID;
    if (!channel) throw new UserError("DISCORD_TICKET_CHANNEL_ID fehlt.");
    const { postPanel } = await import("@/lib/discord/setup");
    await postPanel(channel);
    await audit("discord.setup", { actorId: user.id, meta: { panel: channel } });
    return { ok: true, message: "Panel im Ticket-Channel gepostet." };
  } catch (e) {
    return e instanceof Error && !(e instanceof UserError) ? { ok: false, error: e.message } : toActionError(e);
  }
}

export async function runHousekeepingAction(): Promise<ActionResult> {
  try {
    await lead();
    const { runHousekeeping } = await import("@/lib/housekeeping");
    const r = await runHousekeeping({ budgetMs: 25_000, withRetention: false });
    return { ok: true, message: Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(" · ") };
  } catch (e) {
    return toActionError(e);
  }
}

// ─── Antragsarten ────────────────────────────────────────────

const TypeSchema = z.object({
  id: z.string().optional(),
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/, "Slug: klein, a–z, 0–9, -"),
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(5).max(400),
  icon: z.string().max(30),
  order: z.number().int().min(0).max(999),
  active: z.boolean(),
  visibleFrom: z.enum(["SUPPORT", "MODERATION", "LEITUNG"]),
  decideFrom: z.enum(["SUPPORT", "MODERATION", "LEITUNG"]),
  fourEyes: z.boolean(),
  allowedWhenBanned: z.boolean(),
  requireHonesty: z.boolean(),
  singleOpen: z.boolean(),
  needsSanction: z.boolean(),
  cooldownDays: z.number().int().min(0).max(3650),
  cooldownByBanType: z.record(z.string().min(1).max(60), z.number().int().min(0).max(3650)),
  fields: z.array(FieldDefSchema).min(1).max(30),
  outcomes: z.array(OutcomeSchema).min(2).max(8),
});

export async function saveRequestTypeAction(input: z.input<typeof TypeSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { user } = await lead();
    const parsed = TypeSchema.safeParse(input);
    if (!parsed.success) throw new UserError(`Bitte prüfen: ${parsed.error.issues[0]?.path.join(".")} – ${parsed.error.issues[0]?.message}`);
    const p = parsed.data;
    const keys = p.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) throw new UserError("Jeder Feld-Key darf nur einmal vorkommen.");
    if (new Set(p.outcomes.map((o) => o.key)).size !== p.outcomes.length) throw new UserError("Jeder Ergebnis-Key darf nur einmal vorkommen.");
    const rank = { SUPPORT: 1, MODERATION: 2, LEITUNG: 3 };
    if (rank[p.decideFrom] < rank[p.visibleFrom]) throw new UserError("Wer entscheidet, muss den Antrag auch sehen dürfen.");
    if (p.fourEyes && p.decideFrom === "SUPPORT") throw new UserError("Vier-Augen-Prinzip: Entscheiden ab Moderation einstellen.");
    if (!p.outcomes.some((o) => o.category === "REJECTED")) throw new UserError("Es braucht mindestens ein Ergebnis „abgelehnt“.");
    const clash = await db.requestType.findUnique({ where: { slug: p.slug } });
    if (clash && clash.id !== p.id) throw new UserError("Diesen Slug gibt es schon.");
    const { id, ...data } = p;
    const row = id
      ? await db.requestType.update({ where: { id }, data: { ...data, fields: data.fields as never, outcomes: data.outcomes as never, cooldownByBanType: data.cooldownByBanType as never } })
      : await db.requestType.create({ data: { ...data, fields: data.fields as never, outcomes: data.outcomes as never, cooldownByBanType: data.cooldownByBanType as never } });
    await audit(id ? "request_type.update" : "request_type.create", { actorId: user.id, targetType: "request_type", targetId: row.id });
    revalidatePath("/team/admin/antragsarten");
    revalidatePath("/antraege");
    return { ok: true, data: { id: row.id }, message: "Gespeichert." };
  } catch (e) {
    return toActionError(e);
  }
}
