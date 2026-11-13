import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { buildIndex, missKey, search, type SearchHit, type SearchIndex } from "@/lib/help/search";

let cached: { at: number; index: SearchIndex } | null = null;
const TTL_MS = 60_000;

/** Suchindex aller veröffentlichten Artikel (pro Instanz 60 s gecacht) */
export async function getSearchIndex(): Promise<SearchIndex> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.index;
  const articles = await db.helpArticle.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, slug: true, title: true, summary: true, body: true, tags: true, category: { select: { slug: true, title: true } } },
  });
  const index = buildIndex(
    articles.map((a) => ({ id: a.id, slug: a.slug, title: a.title, summary: a.summary, body: a.body, tags: a.tags, categorySlug: a.category.slug, categoryTitle: a.category.title })),
  );
  cached = { at: Date.now(), index };
  return index;
}

export function invalidateSearchIndex() {
  cached = null;
}

/** Suche; Begriffe ohne Treffer werden fürs Team gezählt (anonym, nur der Begriff). */
export async function searchArticles(query: string, opts: { limit?: number; recordMiss?: boolean } = {}): Promise<SearchHit[]> {
  const q = query.trim().slice(0, 120);
  if (q.length < 2) return [];
  const hits = search(await getSearchIndex(), q, opts.limit ?? 10);
  if (!hits.length && opts.recordMiss) {
    const term = missKey(q);
    if (term.length >= 2) {
      await db.searchMiss
        .upsert({ where: { term }, create: { term }, update: { count: { increment: 1 }, lastAt: new Date() } })
        .catch(() => {});
    }
  }
  return hits;
}

/** Artikelvorschläge für das Ticket-Formular („Vielleicht hilft dir das schon“) */
export async function suggestForTicket(text: string, helpCategory?: string, limit = 3): Promise<SearchHit[]> {
  const q = text.slice(0, 300);
  const hits = search(await getSearchIndex(), q, 8);
  const boosted = hits.map((h) => ({ ...h, score: h.score * (helpCategory && h.doc.categorySlug === helpCategory ? 1.3 : 1) }));
  return boosted.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Anonymer Fingerabdruck für „Hat dir das geholfen?“: pro Tag, nicht rückrechenbar */
export function feedbackFingerprint(ip: string, userAgent: string, day = new Date().toISOString().slice(0, 10)) {
  const secret = process.env.AUTH_SECRET ?? "nv-support";
  return createHmac("sha256", secret).update(`${day}|${ip}|${userAgent.slice(0, 200)}`).digest("hex").slice(0, 32);
}
