import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { formatRelative } from "@/components/ui";

export const metadata: Metadata = { title: "Hilfe-Artikel" };

export default async function TeamArticlesPage() {
  await requireTeam();
  const categories = await db.helpCategory.findMany({
    orderBy: { order: "asc" },
    include: { articles: { orderBy: { title: "asc" }, select: { id: true, title: true, status: true, views: true, helpfulYes: true, helpfulNo: true, contentUpdatedAt: true } } },
  });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nv-label">Team // Hilfe-Artikel</p>
          <h1 className="nv-headline text-4xl mt-3">
            Hilfe-<em>Artikel</em>
          </h1>
        </div>
        <Link href="/team/artikel/neu" className="nv-btn nv-btn-primary nv-btn-sm">
          <Plus size={16} aria-hidden /> Neuer Artikel
        </Link>
      </div>
      <div className="mt-8 space-y-8">
        {categories.map((c) => (
          <section key={c.id}>
            <h2 className="nv-mono mb-2">
              {c.title} ({c.articles.length})
            </h2>
            <div className="nv-card nv-scroll-x">
              <table className="nv-table w-full min-w-[620px]">
                <thead>
                  <tr>
                    <th>Titel</th>
                    <th>Status</th>
                    <th>Aufrufe</th>
                    <th>Hilfreich</th>
                    <th>Aktualisiert</th>
                  </tr>
                </thead>
                <tbody>
                  {c.articles.map((a) => {
                    const total = a.helpfulYes + a.helpfulNo;
                    const quota = total ? Math.round((a.helpfulYes / total) * 100) : null;
                    return (
                      <tr key={a.id}>
                        <td>
                          <Link href={`/team/artikel/${a.id}`} className="font-medium hover:text-red-text">
                            {a.title}
                          </Link>
                        </td>
                        <td>{a.status === "PUBLISHED" ? <span className="nv-pill nv-tone-success">veröffentlicht</span> : <span className="nv-pill nv-tone-muted">Entwurf</span>}</td>
                        <td className="tabular-nums">{a.views}</td>
                        <td className={`tabular-nums ${quota !== null && quota < 50 ? "text-[color:var(--tone-danger)]" : ""}`}>{quota === null ? "–" : `${quota} % (${total})`}</td>
                        <td className="text-sm text-muted">{formatRelative(a.contentUpdatedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
