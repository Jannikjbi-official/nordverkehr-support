import Link from "next/link";
import { ArrowRight, FileText, Lifebuoy, Ticket } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { Container } from "@/components/ui";
import { IconTile } from "@/components/icons";
import { SearchBox } from "@/components/help/SearchBox";
import { StatusStrip } from "@/components/help/StatusStrip";

export default async function HomePage() {
  const [categories, popular] = await Promise.all([
    db.helpCategory.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { articles: { where: { status: "PUBLISHED" } } } } } }),
    db.helpArticle.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ views: "desc" }, { contentUpdatedAt: "desc" }], take: 6, include: { category: { select: { slug: true, title: true } } } }),
  ]);

  return (
    <>
      <section className="relative overflow-hidden pt-36 pb-16 sm:pt-44 sm:pb-20">
        <div className="absolute inset-0 nv-hero-glow pointer-events-none" aria-hidden />
        <div className="absolute inset-0 nv-grid-bg opacity-60 pointer-events-none" aria-hidden />
        <Container className="relative">
          <div className="max-w-3xl mx-auto text-center">
            <p className="nv-label nv-anim justify-center w-full">Nordverkehr // Support</p>
            <h1 className="nv-headline nv-anim mt-5 text-5xl sm:text-6xl lg:text-7xl" style={{ "--i": 1 } as React.CSSProperties}>
              Wobei können wir <em>helfen?</em>
            </h1>
            <p className="nv-anim mt-5 text-base sm:text-lg text-muted" style={{ "--i": 2 } as React.CSSProperties}>
              Erst suchen, dann fragen: Die meisten Antworten stehen schon hier. Und wenn nicht – Ticket auf, wir kümmern uns.
            </p>
            <div className="nv-anim mt-8" style={{ "--i": 3 } as React.CSSProperties}>
              <SearchBox />
            </div>
          </div>
        </Container>
      </section>

      <Container>
        <StatusStrip />

        <section aria-labelledby="kategorien" className="mt-14">
          <p className="nv-label">Themen // 01</p>
          <h2 id="kategorien" className="nv-headline text-3xl sm:text-4xl mt-4">
            Nach <em>Thema</em> stöbern
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((c, i) => (
              <Link key={c.id} href={`/hilfe/${c.slug}`} className="nv-card nv-card-hover p-5 flex flex-col gap-3 nv-anim" style={{ "--i": i } as React.CSSProperties}>
                <IconTile name={c.icon} />
                <div>
                  <h3 className="font-semibold text-lg">{c.title}</h3>
                  <p className="text-sm text-muted mt-1">{c.description}</p>
                </div>
                <p className="nv-mono mt-auto">{c._count.articles} {c._count.articles === 1 ? "Artikel" : "Artikel"}</p>
              </Link>
            ))}
          </div>
        </section>

        {popular.length > 0 && (
          <section aria-labelledby="beliebt" className="mt-16">
            <p className="nv-label">Oft gelesen // 02</p>
            <h2 id="beliebt" className="nv-headline text-3xl sm:text-4xl mt-4">
              Was andere <em>gesucht</em> haben
            </h2>
            <ul className="mt-8 grid gap-3 md:grid-cols-2">
              {popular.map((a) => (
                <li key={a.id}>
                  <Link href={`/hilfe/${a.category.slug}/${a.slug}`} className="nv-card nv-card-hover p-4 flex items-start gap-3">
                    <Lifebuoy size={20} className="text-red-text mt-0.5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-medium block">{a.title}</span>
                      <span className="text-sm text-muted line-clamp-2">{a.summary}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="kontakt" className="mt-16 grid gap-4 md:grid-cols-2">
          <h2 id="kontakt" className="sr-only">
            Kontakt zum Team
          </h2>
          <div className="nv-card p-6 sm:p-8">
            <Ticket size={28} className="text-red-text" aria-hidden />
            <h3 className="nv-headline text-2xl mt-4">
              Nichts gefunden? <em>Ticket auf.</em>
            </h3>
            <p className="text-muted mt-2 text-sm">Technik, Spielerbeschwerde, Bug oder Regelfrage – im Portal oder per Knopf in unserem Discord. Beides landet am selben Ort.</p>
            <Link href="/tickets/neu" className="nv-btn nv-btn-primary mt-5">
              Ticket erstellen <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
          <div className="nv-card p-6 sm:p-8">
            <FileText size={28} className="text-red-text" aria-hidden />
            <h3 className="nv-headline text-2xl mt-4">
              Etwas Formelles? <em>Antrag.</em>
            </h3>
            <p className="text-muted mt-2 text-sm">Entbannung, Einspruch gegen eine Strafe, Namensänderung, Rückerstattung, Fraktion – mit festem Ablauf und begründeter Entscheidung.</p>
            <Link href="/antraege" className="nv-btn nv-btn-ghost mt-5">
              Zu den Anträgen <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </Container>
    </>
  );
}
