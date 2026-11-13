/**
 * Basisdaten anlegen (idempotent): Hilfe-Kategorien, Artikel, Antragsarten,
 * Bausteine. Bestehende Einträge werden NIE überschrieben – nur Fehlendes ergänzt.
 */
import type { PrismaClient } from "@prisma/client";
import { HELP_CATEGORIES, REQUEST_TYPES, TEMPLATES } from "@/lib/setup/seed-data";
import { SEED_ARTICLES } from "@/lib/setup/articles";

export async function ensureBaseData(db: PrismaClient, log: (m: string) => void = () => {}) {
  const catIds = new Map<string, string>();
  for (const [i, c] of HELP_CATEGORIES.entries()) {
    const existing = await db.helpCategory.findUnique({ where: { slug: c.slug } });
    const row = existing ?? (await db.helpCategory.create({ data: { ...c, order: i } }));
    catIds.set(c.slug, row.id);
  }
  log(`Kategorien: ${catIds.size}`);

  let articles = 0;
  const now = new Date();
  for (const a of SEED_ARTICLES) {
    if (await db.helpArticle.findUnique({ where: { slug: a.slug } })) continue;
    const categoryId = catIds.get(a.category);
    if (!categoryId) continue;
    await db.helpArticle.create({
      data: { slug: a.slug, title: a.title, summary: a.summary, body: a.body, tags: a.tags, categoryId, status: "PUBLISHED", publishedAt: now, contentUpdatedAt: now },
    });
    articles++;
  }
  // Verwandte Artikel verknüpfen (Slugs → IDs)
  const all = await db.helpArticle.findMany({ select: { id: true, slug: true, relatedIds: true } });
  const bySlug = new Map(all.map((a) => [a.slug, a.id]));
  for (const a of SEED_ARTICLES) {
    const row = all.find((x) => x.slug === a.slug);
    if (!row || row.relatedIds.length) continue;
    const ids = a.related.map((s) => bySlug.get(s)).filter((x): x is string => !!x);
    if (ids.length) await db.helpArticle.update({ where: { id: row.id }, data: { relatedIds: ids } });
  }
  log(`Artikel neu: ${articles}`);

  let types = 0;
  for (const t of REQUEST_TYPES) {
    if (await db.requestType.findUnique({ where: { slug: t.slug } })) continue;
    await db.requestType.create({
      data: {
        slug: t.slug,
        title: t.title,
        description: t.description,
        icon: t.icon,
        order: t.order,
        active: t.active,
        visibleFrom: t.visibleFrom,
        decideFrom: t.decideFrom,
        fourEyes: t.fourEyes,
        allowedWhenBanned: t.allowedWhenBanned,
        requireHonesty: t.requireHonesty,
        singleOpen: t.singleOpen,
        needsSanction: t.needsSanction,
        outcomes: t.outcomes as never,
        cooldownDays: t.cooldownDays,
        cooldownByBanType: (t.cooldownByBanType ?? null) as never,
        fields: t.fields as never,
      },
    });
    types++;
  }
  log(`Antragsarten neu: ${types}`);

  if ((await db.messageTemplate.count()) === 0) {
    await db.messageTemplate.createMany({
      data: TEMPLATES.map((t, i) => ({ title: t.title, body: t.body, scope: t.scope, ticketCategory: t.ticketCategory ?? null, requestTypeSlug: t.requestTypeSlug ?? null, order: i })),
    });
    log(`Bausteine: ${TEMPLATES.length}`);
  }
}

let ensured = false;

/** Ersteinrichtung bei leerer Datenbank (einmal pro Instanz geprüft) */
export async function ensureBaseDataOnce(db: PrismaClient) {
  if (ensured) return;
  ensured = true;
  if ((await db.helpCategory.count()) > 0 && (await db.requestType.count()) > 0) return;
  await ensureBaseData(db, (m) => console.log("[setup]", m));
}
