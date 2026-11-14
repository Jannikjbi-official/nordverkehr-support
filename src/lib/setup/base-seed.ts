/**
 * Basisdaten anlegen (idempotent): Hilfe-Kategorien, Artikel, Antragsarten,
 * Bausteine. Bestehende Einträge werden NIE überschrieben – nur Fehlendes ergänzt.
 */
import type { PrismaClient } from "@prisma/client";
import { HELP_CATEGORIES, REQUEST_TYPES, TEMPLATES } from "@/lib/setup/seed-data";
import { SEED_ARTICLES, SEED_CONTENT_VERSION } from "@/lib/setup/articles";

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
  // Bereits einmal angelegte Standard-Artikel nie erneut anlegen (falls das Team sie gelöscht hat)
  const seeded = await seededArticleSlugs(db);
  for (const a of SEED_ARTICLES) {
    if (seeded.has(a.slug)) continue;
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
  // Neue Fassung der Standard-Texte: nur Artikel, die das Team nie bearbeitet hat
  // (kein Autor, Inhalt seit dem Anlegen unverändert), werden aktualisiert.
  if ((await seedContentVersion(db)) < SEED_CONTENT_VERSION) {
    let updated = 0;
    for (const a of SEED_ARTICLES) {
      const row = await db.helpArticle.findUnique({ where: { slug: a.slug } });
      if (!row || row.authorId || !row.publishedAt || row.contentUpdatedAt.getTime() !== row.publishedAt.getTime()) continue;
      const same = row.title === a.title && row.summary === a.summary && row.body === a.body && row.tags.join("|") === a.tags.join("|");
      if (same) continue;
      await db.helpArticle.update({ where: { id: row.id }, data: { title: a.title, summary: a.summary, body: a.body, tags: a.tags, contentUpdatedAt: now, publishedAt: now } });
      updated++;
    }
    await db.setting.upsert({ where: { key: CONTENT_VERSION_KEY }, create: { key: CONTENT_VERSION_KEY, value: SEED_CONTENT_VERSION }, update: { value: SEED_CONTENT_VERSION } });
    log(`Artikel aktualisiert: ${updated}`);
  }

  await db.setting.upsert({
    where: { key: SEEDED_ARTICLES_KEY },
    create: { key: SEEDED_ARTICLES_KEY, value: SEED_ARTICLES.map((a) => a.slug) },
    update: { value: [...new Set([...seeded, ...SEED_ARTICLES.map((a) => a.slug)])] },
  });
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

const SEEDED_ARTICLES_KEY = "seed.articleSlugs";
const CONTENT_VERSION_KEY = "seed.contentVersion";

async function seedContentVersion(db: PrismaClient): Promise<number> {
  const row = await db.setting.findUnique({ where: { key: CONTENT_VERSION_KEY } });
  return typeof row?.value === "number" ? row.value : 0;
}

async function seededArticleSlugs(db: PrismaClient): Promise<Set<string>> {
  const row = await db.setting.findUnique({ where: { key: SEEDED_ARTICLES_KEY } });
  return new Set(Array.isArray(row?.value) ? (row.value as unknown[]).filter((x): x is string => typeof x === "string") : []);
}

/** Gibt es neue Standard-Artikel, die noch nie angelegt wurden? (z. B. nach einem Update) */
async function hasNewSeedArticles(db: PrismaClient) {
  const seeded = await seededArticleSlugs(db);
  const missing = SEED_ARTICLES.filter((a) => !seeded.has(a.slug)).map((a) => a.slug);
  if (!missing.length) return false;
  // Ältere Datenbanken ohne Merkliste: vorhandene Artikel zählen als angelegt
  const existing = await db.helpArticle.count({ where: { slug: { in: missing } } });
  return existing < missing.length || seeded.size === 0;
}

let ensured = false;

/** Ersteinrichtung bei leerer Datenbank (einmal pro Instanz geprüft) */
export async function ensureBaseDataOnce(db: PrismaClient, log: (m: string) => void = (m) => console.log("[setup]", m)) {
  if (ensured) return;
  ensured = true;
  if ((await db.helpCategory.count()) > 0 && (await db.requestType.count()) > 0 && !(await hasNewSeedArticles(db)) && (await seedContentVersion(db)) >= SEED_CONTENT_VERSION) return;
  await ensureBaseData(db, log);
}
