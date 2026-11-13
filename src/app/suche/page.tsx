import type { Metadata } from "next";
import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/ssr";
import { searchArticles } from "@/lib/help/service";
import { Container, EmptyState } from "@/components/ui";
import { SearchBox } from "@/components/help/SearchBox";

export const metadata: Metadata = { title: "Suche", robots: { index: false } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q ?? "").trim().slice(0, 120);
  // Suchbegriffe ohne Treffer werden (anonym, nur der Begriff) fürs Team gezählt
  const hits = q.length >= 2 ? await searchArticles(q, { limit: 20, recordMiss: true }) : [];

  return (
    <Container className="pt-32 sm:pt-36">
      <p className="nv-label">Hilfe // Suche</p>
      <h1 className="nv-headline text-4xl sm:text-5xl mt-4">{q ? <>Ergebnisse für <em>„{q}“</em></> : <>Hilfe <em>durchsuchen</em></>}</h1>
      <div className="mt-8 max-w-2xl">
        <SearchBox initial={q} size="md" autoFocus={!q} />
      </div>
      <div className="mt-10 max-w-3xl">
        {q.length >= 2 && hits.length === 0 && (
          <EmptyState icon={MagnifyingGlass} title="Nichts gefunden" action={<Link href={`/tickets/neu?betreff=${encodeURIComponent(q)}`} className="nv-btn nv-btn-primary">Ticket erstellen</Link>}>
            Probier andere Wörter – oder frag direkt das Team. Wir merken uns, wonach gesucht wurde, und schreiben passende Artikel.
          </EmptyState>
        )}
        {hits.length > 0 && (
          <>
            <p className="text-sm text-muted mb-4" role="status">
              {hits.length} {hits.length === 1 ? "Treffer" : "Treffer"}
            </p>
            <ul className="grid gap-3">
              {hits.map((h) => (
                <li key={h.doc.id}>
                  <Link href={`/hilfe/${h.doc.categorySlug}/${h.doc.slug}`} className="nv-card nv-card-hover p-5 block">
                    <p className="nv-mono">{h.doc.categoryTitle}</p>
                    <h2 className="font-semibold text-lg mt-1">{h.doc.title}</h2>
                    <p className="text-sm text-muted mt-1">{h.snippet}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
