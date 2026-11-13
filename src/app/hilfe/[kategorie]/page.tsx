import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { Container, EmptyState, PageHero, formatDay } from "@/components/ui";
import { IconTile } from "@/components/icons";
import { SearchBox } from "@/components/help/SearchBox";

type Props = { params: Promise<{ kategorie: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { kategorie } = await params;
  const c = await db.helpCategory.findUnique({ where: { slug: kategorie } });
  return { title: c?.title ?? "Hilfe", description: c?.description };
}

export default async function CategoryPage({ params }: Props) {
  const { kategorie } = await params;
  const category = await db.helpCategory.findUnique({
    where: { slug: kategorie },
    include: { articles: { where: { status: "PUBLISHED" }, orderBy: [{ views: "desc" }, { title: "asc" }] } },
  });
  if (!category) notFound();
  const others = await db.helpCategory.findMany({ where: { NOT: { id: category.id } }, orderBy: { order: "asc" } });

  return (
    <>
      <PageHero label={`Hilfe // ${category.title}`} title={category.title} compact aside={<IconTile name={category.icon} className="!h-16 !w-16" />}>
        {category.description}
      </PageHero>
      <Container>
        <div className="max-w-2xl mb-10">
          <SearchBox size="md" />
        </div>
        <div className="grid gap-10 lg:grid-cols-[1fr_260px]">
          <div>
            {category.articles.length === 0 ? (
              <EmptyState title="Noch keine Artikel">Hier kommt bald was. Bis dahin hilft dir das Team per Ticket.</EmptyState>
            ) : (
              <ul className="grid gap-3">
                {category.articles.map((a) => (
                  <li key={a.id}>
                    <Link href={`/hilfe/${category.slug}/${a.slug}`} className="nv-card nv-card-hover p-5 flex items-start gap-4">
                      <div className="flex-1">
                        <h2 className="font-semibold text-lg">{a.title}</h2>
                        <p className="text-sm text-muted mt-1">{a.summary}</p>
                        <p className="nv-mono mt-3">Aktualisiert {formatDay(a.contentUpdatedAt)}</p>
                      </div>
                      <ArrowRight size={18} className="text-red-text mt-1" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <nav aria-label="Weitere Themen" className="space-y-1">
            <p className="nv-mono mb-3">Weitere Themen</p>
            {others.map((o) => (
              <Link key={o.id} href={`/hilfe/${o.slug}`} className="block rounded-lg px-3 py-2 text-sm text-fg-2 hover:text-fg hover:bg-card-hover">
                {o.title}
              </Link>
            ))}
          </nav>
        </div>
      </Container>
    </>
  );
}
