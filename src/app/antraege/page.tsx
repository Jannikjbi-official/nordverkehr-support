import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Prohibit } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { eligibilityFor } from "@/lib/requests/service";
import { Container, Notice, PageHero, RequestStatusBadge, formatRelative } from "@/components/ui";
import { IconTile } from "@/components/icons";

export const metadata: Metadata = { title: "Anträge", robots: { index: false } };

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ gesperrt?: string }> }) {
  const { user, access } = await requireUser("/antraege");
  const { gesperrt } = await searchParams;
  const banned = access.guildBanned;
  const [types, mine] = await Promise.all([
    db.requestType.findMany({ where: { active: true, ...(banned ? { allowedWhenBanned: true } : {}) }, orderBy: { order: "asc" } }),
    db.request.findMany({ where: { applicantId: user.id }, orderBy: { createdAt: "desc" }, include: { type: { select: { title: true } } } }),
  ]);
  const eligibility = await Promise.all(types.map((t) => eligibilityFor(user, t, banned)));

  return (
    <>
      <PageHero label="Support // Anträge" title="Anträge –" emphasis="mit Entscheidung." compact>
        Für formelle Vorgänge mit festem Ablauf: Du füllst aus, das Team prüft, du bekommst eine Entscheidung mit Begründung. Rückfragen und Ergebnis siehst du hier.
      </PageHero>
      <Container>
        {banned && (
          <Notice tone="danger" icon={Prohibit} title="Du bist vom Nordverkehr-Discord gebannt" className="mb-8">
            Deshalb siehst du hier nur den Entbannungsantrag und den Stand deiner Anträge. DMs vom Bot erreichen dich gerade vermutlich nicht – schau einfach hier vorbei.
            {access.guildBanReason ? (
              <>
                {" "}
                Grund laut Discord: <strong>{access.guildBanReason}</strong>
              </>
            ) : null}
          </Notice>
        )}
        {gesperrt && !banned && <Notice tone="info" className="mb-8">Die Seite, die du öffnen wolltest, ist nur ohne Bann erreichbar.</Notice>}

        <section aria-labelledby="neu">
          <h2 id="neu" className="nv-mono mb-3">
            Antrag stellen
          </h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {types.map((t, k) => {
              const e = eligibility[k];
              return (
                <li key={t.id}>
                  <div className={`nv-card p-5 h-full flex gap-4 ${e.ok ? "" : "opacity-80"}`}>
                    <IconTile name={t.icon} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold">{t.title}</h3>
                      <p className="text-sm text-muted mt-1">{t.description}</p>
                      {e.ok ? (
                        <Link href={`/antraege/neu/${t.slug}`} className="nv-btn nv-btn-primary nv-btn-sm mt-4">
                          Ausfüllen <ArrowRight size={14} aria-hidden />
                        </Link>
                      ) : (
                        <p className="text-sm mt-3 text-[color:var(--tone-warn)]">{e.reason}</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="meine" className="mt-12">
          <h2 id="meine" className="nv-mono mb-3">
            Meine Anträge ({mine.length})
          </h2>
          {mine.length === 0 ? (
            <p className="text-sm text-muted">Du hast noch keine Anträge gestellt.</p>
          ) : (
            <ul className="grid gap-3">
              {mine.map((r) => (
                <li key={r.id}>
                  <Link href={`/antraege/${r.id}`} className="nv-card nv-card-hover p-4 flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[200px]">
                      <span className="font-semibold block">{r.type.title}</span>
                      <span className="text-xs text-muted">
                        {r.publicId} · eingereicht {formatRelative(r.createdAt)}
                      </span>
                    </span>
                    <RequestStatusBadge status={r.status} outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Container>
    </>
  );
}
