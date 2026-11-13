"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { assertTeam } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { toActionError, UserError, type ActionResult } from "@/lib/errors";
import { invalidateSearchIndex } from "@/lib/help/service";
import { slugify } from "@/components/Markdown";

// ─── Hilfe-Artikel ───────────────────────────────────────────

const ArticleSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(4).max(140),
  slug: z.string().trim().max(80).optional(),
  summary: z.string().trim().min(10).max(300),
  body: z.string().max(30_000),
  categoryId: z.string().min(10).max(40),
  tags: z.array(z.string().trim().toLowerCase().max(30)).max(12).default([]),
  relatedIds: z.array(z.string().max(40)).max(6).default([]),
  status: z.enum(["DRAFT", "PUBLISHED"]),
});

export async function saveArticleAction(input: z.input<typeof ArticleSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const { user } = await assertTeam("SUPPORT");
    const p = ArticleSchema.parse(input);
    const slug = slugify(p.slug || p.title);
    const clash = await db.helpArticle.findUnique({ where: { slug } });
    if (clash && clash.id !== p.id) throw new UserError("Diesen Slug gibt es schon. Bitte einen anderen wählen.");
    const now = new Date();
    const data = { title: p.title, slug, summary: p.summary, body: p.body, categoryId: p.categoryId, tags: p.tags.filter(Boolean), relatedIds: p.relatedIds.filter((x) => x !== p.id), status: p.status };
    let id = p.id;
    if (id) {
      const before = await db.helpArticle.findUnique({ where: { id } });
      if (!before) throw new UserError("Artikel nicht gefunden.");
      const contentChanged = before.body !== p.body || before.title !== p.title || before.summary !== p.summary;
      await db.helpArticle.update({
        where: { id },
        data: { ...data, ...(contentChanged ? { contentUpdatedAt: now } : {}), ...(p.status === "PUBLISHED" && !before.publishedAt ? { publishedAt: now } : {}) },
      });
      await audit(p.status === "PUBLISHED" && before.status !== "PUBLISHED" ? "article.publish" : "article.update", { actorId: user.id, targetType: "article", targetId: id });
    } else {
      const a = await db.helpArticle.create({ data: { ...data, authorId: user.id, contentUpdatedAt: now, publishedAt: p.status === "PUBLISHED" ? now : null } });
      id = a.id;
      await audit("article.create", { actorId: user.id, targetType: "article", targetId: id });
    }
    invalidateSearchIndex();
    revalidatePath("/team/artikel");
    revalidatePath("/", "layout");
    return { ok: true, data: { id } };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: `Bitte prüfen: ${e.issues[0]?.path.join(".")} – ${e.issues[0]?.message}` };
    return toActionError(e);
  }
}

export async function deleteArticleAction(id: string): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    await db.helpArticle.delete({ where: { id } });
    await audit("article.delete", { actorId: user.id, targetType: "article", targetId: id });
    invalidateSearchIndex();
    revalidatePath("/team/artikel");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** Suchbegriff ohne Treffer als erledigt markieren (z. B. Artikel geschrieben) */
export async function dismissSearchMissAction(id: string): Promise<ActionResult> {
  try {
    await assertTeam("SUPPORT");
    await db.searchMiss.delete({ where: { id } });
    revalidatePath("/team/statistiken");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─── Statusseite ─────────────────────────────────────────────

const IncidentSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(4).max(140),
  body: z.string().trim().min(4).max(5000),
  kind: z.enum(["PROBLEM", "MAINTENANCE"]),
  severity: z.enum(["INFO", "MINOR", "MAJOR"]),
  systems: z.array(z.enum(["gameserver", "teamspeak", "discord", "website"])).max(4),
  startsAt: z.string(),
  endsAt: z.string().optional(),
});

export async function saveIncidentAction(input: z.input<typeof IncidentSchema>): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("SUPPORT");
    const p = IncidentSchema.parse(input);
    const startsAt = new Date(p.startsAt);
    const endsAt = p.endsAt ? new Date(p.endsAt) : null;
    if (Number.isNaN(startsAt.getTime()) || (endsAt && Number.isNaN(endsAt.getTime()))) throw new UserError("Ungültiges Datum.");
    const data = { title: p.title, body: p.body, kind: p.kind, severity: p.severity, systems: p.systems, startsAt, endsAt };
    if (p.id) {
      await db.statusIncident.update({ where: { id: p.id }, data });
      await audit("incident.update", { actorId: user.id, targetType: "incident", targetId: p.id });
    } else {
      const i = await db.statusIncident.create({ data: { ...data, createdById: user.id } });
      await audit("incident.create", { actorId: user.id, targetType: "incident", targetId: i.id });
    }
    revalidatePath("/status");
    revalidatePath("/team/status");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function incidentUpdateAction(id: string, text: string, resolve: boolean): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("SUPPORT");
    const i = await db.statusIncident.findUnique({ where: { id } });
    if (!i) throw new UserError("Nicht gefunden.");
    const updates = [...((Array.isArray(i.updates) ? i.updates : []) as { at: string; text: string }[])];
    if (text.trim()) updates.push({ at: new Date().toISOString(), text: text.trim().slice(0, 1000) });
    await db.statusIncident.update({ where: { id }, data: { updates, ...(resolve ? { resolvedAt: new Date() } : {}) } });
    await audit("incident.update", { actorId: user.id, targetType: "incident", targetId: id, meta: { resolve } });
    revalidatePath("/status");
    revalidatePath("/team/status");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteIncidentAction(id: string): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    await db.statusIncident.delete({ where: { id } });
    await audit("incident.delete", { actorId: user.id, targetType: "incident", targetId: id });
    revalidatePath("/status");
    revalidatePath("/team/status");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

// ─── Nachrichtenbausteine ────────────────────────────────────

const TemplateSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2).max(80),
  body: z.string().trim().min(2).max(4000),
  scope: z.enum(["ticket", "request", "all"]),
  ticketCategory: z.string().max(30).optional().nullable(),
  requestTypeSlug: z.string().max(40).optional().nullable(),
});

export async function saveTemplateAction(input: z.input<typeof TemplateSchema>): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    const p = TemplateSchema.parse(input);
    const data = { title: p.title, body: p.body, scope: p.scope, ticketCategory: p.scope === "ticket" ? p.ticketCategory || null : null, requestTypeSlug: p.scope === "request" ? p.requestTypeSlug || null : null };
    if (p.id) {
      await db.messageTemplate.update({ where: { id: p.id }, data });
      await audit("template.update", { actorId: user.id, targetType: "template", targetId: p.id });
    } else {
      const count = await db.messageTemplate.count();
      const t = await db.messageTemplate.create({ data: { ...data, order: count } });
      await audit("template.create", { actorId: user.id, targetType: "template", targetId: t.id });
    }
    revalidatePath("/team/bausteine");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteTemplateAction(id: string): Promise<ActionResult> {
  try {
    const { user } = await assertTeam("MODERATION");
    await db.messageTemplate.delete({ where: { id } });
    await audit("template.delete", { actorId: user.id, targetType: "template", targetId: id });
    revalidatePath("/team/bausteine");
    return { ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
