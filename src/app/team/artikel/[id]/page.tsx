import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { ArticleEditor } from "@/components/team/ArticleEditor";
import { formatRelative } from "@/components/ui";

export const metadata: Metadata = { title: "Artikel bearbeiten" };

export default async function ArticleEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { access } = await requireTeam();
  const isNew = id === "neu";
  const [article, categories, all, feedback] = await Promise.all([
    isNew ? Promise.resolve(null) : db.helpArticle.findUnique({ where: { id }, include: { category: true } }),
    db.helpCategory.findMany({ orderBy: { order: "asc" } }),
    db.helpArticle.findMany({ select: { id: true, title: true }, orderBy: { title: "asc" } }),
    isNew ? Promise.resolve([]) : db.articleFeedback.findMany({ where: { articleId: id, comment: { not: null } }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  if (!isNew && !article) notFound();
  return (
    <div>
      <Link href="/team/artikel" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Alle Artikel
      </Link>
      <h1 className="nv-headline text-3xl mt-4">{isNew ? "Neuer Artikel" : article!.title}</h1>
      {article && (
        <p className="text-sm text-muted mt-1">
          {article.views} Aufrufe · {article.helpfulYes} × hilfreich · {article.helpfulNo} × nicht hilfreich ·{" "}
          {article.status === "PUBLISHED" && (
            <Link href={`/hilfe/${article.category.slug}/${article.slug}`} className="nv-link" target="_blank">
              Ansehen
            </Link>
          )}
        </p>
      )}
      <div className="mt-6">
        <ArticleEditor
          canDelete={access.isMod}
          categories={categories.map((c) => ({ id: c.id, title: c.title }))}
          articles={all.filter((a) => a.id !== id)}
          initial={
            article
              ? { id: article.id, title: article.title, slug: article.slug, summary: article.summary, body: article.body, categoryId: article.categoryId, tags: article.tags, relatedIds: article.relatedIds, status: article.status }
              : { title: "", slug: "", summary: "", body: "## Abschnitt\n\nText …\n\n## Hilft alles nichts?\n\nMach ein [Ticket](/tickets/neu) auf.", categoryId: categories[0]?.id ?? "", tags: [], relatedIds: [], status: "DRAFT" }
          }
        />
      </div>
      {feedback.length > 0 && (
        <section className="mt-10 nv-card p-5">
          <h2 className="nv-mono mb-3">Kommentare aus „Hat dir das geholfen?“</h2>
          <ul className="space-y-2 text-sm">
            {feedback.map((f) => (
              <li key={f.id}>
                <span className={f.helpful ? "text-[color:var(--tone-success)]" : "text-[color:var(--tone-danger)]"}>{f.helpful ? "Ja" : "Nein"}</span> · {f.comment}{" "}
                <span className="text-xs text-muted">{formatRelative(f.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
