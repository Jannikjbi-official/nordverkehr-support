import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Ticket } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { Container, formatDay } from "@/components/ui";
import { Markdown, extractToc } from "@/components/Markdown";
import { ArticleFeedback } from "@/components/help/ArticleFeedback";
import { SHOP_URL, shopLegalLinks } from "@/lib/public-urls";

type Props = { params: Promise<{ kategorie: string; artikel: string }> };

async function load(slug: string) {
  return db.helpArticle.findUnique({ where: { slug }, include: { category: true } });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { artikel } = await params;
  const a = await load(artikel);
  if (!a || a.status !== "PUBLISHED") return { title: "Hilfe" };
  return { title: a.title, description: a.summary };
}

export default async function ArticlePage({ params }: Props) {
  const { kategorie, artikel } = await params;
  const a = await load(artikel);
  if (!a || a.status !== "PUBLISHED" || a.category.slug !== kategorie) notFound();
  after(() => db.helpArticle.update({ where: { id: a.id }, data: { views: { increment: 1 } } }).catch(() => {}));

  const toc = extractToc(a.body);
  const related = a.relatedIds.length
    ? await db.helpArticle.findMany({ where: { id: { in: a.relatedIds }, status: "PUBLISHED" }, include: { category: { select: { slug: true } } } })
    : await db.helpArticle.findMany({ where: { categoryId: a.categoryId, status: "PUBLISHED", NOT: { id: a.id } }, take: 3, include: { category: { select: { slug: true } } } });

  return (
    <Container className="pt-32 sm:pt-36">
      <nav aria-label="Brotkrumen" className="text-sm text-muted flex flex-wrap gap-1.5 items-center">
        <Link href="/" className="hover:text-fg">Hilfe</Link>
        <span aria-hidden>/</span>
        <Link href={`/hilfe/${a.category.slug}`} className="hover:text-fg">{a.category.title}</Link>
      </nav>
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_260px]">
        <article className="min-w-0 max-w-3xl">
          <p className="nv-label">{a.category.title}</p>
          <h1 className="nv-headline text-4xl sm:text-5xl mt-4">{a.title}</h1>
          <p className="text-lg text-muted mt-4">{a.summary}</p>
          <p className="nv-mono mt-4">Zuletzt aktualisiert: {formatDay(a.contentUpdatedAt)}</p>
          <div className="nv-divider my-8" />
          <Markdown source={a.body} />
          {a.category.slug === "shop-zahlungen" && SHOP_URL && (
            <aside className="mt-8 nv-card p-5 text-sm" aria-label="Shop-Bedingungen">
              <p className="nv-mono mb-2">Shop-Bedingungen (Tebex)</p>
              <p className="text-muted">Verkauf und Zahlung laufen über Tebex. Dort gelten zusätzlich:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className="nv-btn nv-btn-ghost nv-btn-sm">
                    Zum Shop
                  </a>
                </li>
                {shopLegalLinks(SHOP_URL).map((l) => (
                  <li key={l.href}>
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="nv-btn nv-btn-quiet nv-btn-sm">
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <div className="mt-12">
            <ArticleFeedback articleId={a.id} />
          </div>

          <div className="mt-8 nv-card p-5 flex flex-wrap items-center gap-4">
            <Ticket size={24} className="text-red-text" aria-hidden />
            <p className="flex-1 min-w-[200px] text-sm text-muted">Hilft alles nichts? Mach ein Ticket auf – wir schauen uns das an.</p>
            <Link href={`/tickets/neu?artikel=${a.slug}`} className="nv-btn nv-btn-primary nv-btn-sm">
              Ticket erstellen
            </Link>
          </div>

          <Link href={`/hilfe/${a.category.slug}`} className="nv-btn nv-btn-quiet nv-btn-sm mt-8">
            <ArrowLeft size={14} aria-hidden /> Zurück zu {a.category.title}
          </Link>
        </article>

        <aside className="space-y-8 lg:sticky lg:top-28 self-start">
          {toc.length > 1 && (
            <nav aria-label="Inhaltsverzeichnis">
              <p className="nv-mono mb-3">Inhalt</p>
              <ol className="space-y-1.5 text-sm border-l border-line">
                {toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "pl-6" : "pl-3"}>
                    <a href={`#${t.id}`} className="text-fg-2 hover:text-fg">
                      {t.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          {related.length > 0 && (
            <div>
              <p className="nv-mono mb-3">Verwandte Artikel</p>
              <ul className="space-y-2">
                {related.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hilfe/${r.category.slug}/${r.slug}`} className="flex gap-2 text-sm text-fg-2 hover:text-fg">
                      <ArrowRight size={14} className="text-red-text mt-1 shrink-0" aria-hidden />
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>
    </Container>
  );
}
