import { searchArticles } from "@/lib/help/service";
import { rateLimit } from "@/lib/rate-limit";

/** Öffentliche Suche (Live-Vorschläge). Speichert Begriffe ohne Treffer nicht (das macht die Suchseite). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 120);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anon";
  const rl = await rateLimit(`search:${ip}`, 120, 60);
  if (!rl.ok) return Response.json({ hits: [] }, { status: 429 });
  const hits = await searchArticles(q, { limit: 8, recordMiss: false });
  return Response.json(
    {
      hits: hits.map((h) => ({ title: h.doc.title, url: `/hilfe/${h.doc.categorySlug}/${h.doc.slug}`, snippet: h.snippet, category: h.doc.categoryTitle })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
