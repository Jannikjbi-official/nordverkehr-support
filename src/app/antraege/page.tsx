import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChatCircleDots, ClockCountdown, Eyes, Lock, Prohibit, ShieldCheck } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { eligibilityFor } from "@/lib/requests/service";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { Container, Notice, PageHero, RequestStatusBadge, cn, formatRelative } from "@/components/ui";
import { IconTile } from "@/components/icons";
import { RequestProgress } from "@/components/requests/RequestProgress";

export const metadata: Metadata = { title: "Anträge", robots: { index: false } };

const HOW = [
  { n: "1", title: "Ausfüllen", text: "Formular in Ruhe ausfüllen, Belege anhängen – Clips helfen fast immer." },
  { n: "2", title: "Prüfung", text: "Das Team prüft. Bei Rückfragen bekommst du eine DM und antwortest hier." },
  { n: "3", title: "Entscheidung", text: "Immer mit Begründung. Bei Ablehnung gilt je nach Art eine Sperrfrist." },
];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ gesperrt?: string }> }) {
  const { user, access } = await requireUser("/antraege");
  const { gesperrt } = await searchParams;
  const banned = access.guildBanned;
  const [types, mine] = await Promise.all([
    db.requestType.findMany({ where: { active: true, ...(banned ? { allowedWhenBanned: true } : {}) }, orderBy: { order: "asc" } }),
    db.request.findMany({ where: { applicantId: user.id }, orderBy: { createdAt: "desc" }, include: { type: { select: { title: true, icon: true } } } }),
  ]);
  const eligibility = await Promise.all(types.map((t) => eligibilityFor(user, t, banned)));
  const open = mine.filter((r) => ["SUBMITTED", "IN_REVIEW", "QUESTION"].includes(r.status));
  const done = mine.filter((r) => !open.includes(r));
  const questions = open.filter((r) => r.status === "QUESTION").length;

  return (
    <>
      <PageHero
        label="Support // Anträge"
        title="Anträge –"
        emphasis="mit Entscheidung."
        compact
        aside={
          mine.length > 0 ? (
            <div className="nv-card px-5 py-4 flex gap-6 text-sm">
              <div>
                <p className="font-display text-3xl leading-none">{open.length}</p>
                <p className="text-muted mt-1">offen</p>
              </div>
              <div>
                <p className="font-display text-3xl leading-none">{done.length}</p>
                <p className="text-muted mt-1">entschieden</p>
              </div>
            </div>
          ) : undefined
        }
      >
        Für formelle Vorgänge mit festem Ablauf: Du füllst aus, das Team prüft, du bekommst eine Entscheidung mit Begründung.
      </PageHero>

      <Container className="pb-16 space-y-12">
        {banned && (
          <Notice tone="danger" icon={Prohibit} title="Du bist vom Nordverkehr-Discord gebannt">
            Deshalb siehst du hier nur den Entbannungsantrag und den Stand deiner Anträge. DMs vom Bot erreichen dich gerade vermutlich nicht – schau einfach hier vorbei.
            {access.guildBanReason ? (
              <>
                {" "}
                Grund laut Discord: <strong>{access.guildBanReason}</strong>
              </>
            ) : null}
          </Notice>
        )}
        {gesperrt && !banned && <Notice tone="info">Die Seite, die du öffnen wolltest, ist nur ohne Bann erreichbar.</Notice>}
        {questions > 0 && (
          <Notice tone="warn" icon={ChatCircleDots} title={questions === 1 ? "Das Team hat eine Rückfrage an dich" : `Das Team hat ${questions} Rückfragen an dich`}>
            Bis du antwortest, ruht der Antrag. Öffne ihn unten und antworte direkt dort.
          </Notice>
        )}

        {open.length > 0 && (
          <section aria-labelledby="laufend">
            <h2 id="laufend" className="nv-mono mb-3">
              Laufende Anträge
            </h2>
            <ul className="grid gap-3 md:grid-cols-2">
              {open.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/antraege/${r.id}`}
                    className={cn("nv-card nv-card-hover p-5 h-full flex flex-col gap-4", r.status === "QUESTION" && "!border-[color:var(--tone-warn)]")}
                  >
                    <div className="flex items-start gap-3">
                      <IconTile name={r.type.icon} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold">{r.type.title}</p>
                        <p className="text-xs text-muted mt-0.5">
                          {r.publicId} · eingereicht {formatRelative(r.createdAt)}
                        </p>
                      </div>
                      <RequestStatusBadge status={r.status} outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
                    </div>
                    <div className="flex items-center justify-between gap-3 mt-auto">
                      <RequestProgress status={r.status} createdAt={r.createdAt} compact />
                      <span className="text-sm text-red-text inline-flex items-center gap-1">
                        {r.status === "QUESTION" ? "Antworten" : "Ansehen"} <ArrowRight size={14} aria-hidden />
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="neu">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <h2 id="neu" className="nv-mono">
              Antrag stellen
            </h2>
          </div>
          <ol className="grid gap-3 sm:grid-cols-3 mb-6">
            {HOW.map((h) => (
              <li key={h.n} className="flex gap-3 rounded-xl border border-line px-4 py-3">
                <span className="font-display text-2xl text-red-text leading-none">{h.n}</span>
                <span className="text-sm">
                  <span className="font-semibold block">{h.title}</span>
                  <span className="text-muted">{h.text}</span>
                </span>
              </li>
            ))}
          </ol>
          <ul className="grid gap-3 md:grid-cols-2">
            {types.map((t, k) => {
              const e = eligibility[k];
              const meta = (
                <ul className="mt-4 flex flex-wrap gap-1.5 text-xs">
                  <li className="nv-pill nv-tone-muted !normal-case">
                    <Eyes size={12} aria-hidden /> entscheidet: {LEVEL_LABEL[t.decideFrom]}
                  </li>
                  {t.fourEyes && (
                    <li className="nv-pill nv-tone-info !normal-case">
                      <ShieldCheck size={12} aria-hidden /> Vier Augen
                    </li>
                  )}
                  {t.cooldownDays > 0 && (
                    <li className="nv-pill nv-tone-muted !normal-case">
                      <ClockCountdown size={12} aria-hidden /> {t.cooldownDays} Tage Sperrfrist bei Ablehnung
                    </li>
                  )}
                </ul>
              );
              return (
                <li key={t.id}>
                  {e.ok ? (
                    <Link href={`/antraege/neu/${t.slug}`} className="group nv-card nv-card-hover p-5 h-full flex gap-4">
                      <IconTile name={t.icon} />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold flex items-center gap-2">
                          {t.title}
                          <ArrowRight size={16} className="text-red-text ml-auto shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
                        </h3>
                        <p className="text-sm text-muted mt-1">{t.description}</p>
                        {meta}
                      </div>
                    </Link>
                  ) : (
                    <div className="nv-card p-5 h-full flex gap-4" aria-disabled>
                      <IconTile name={t.icon} className="opacity-60" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold flex items-center gap-2 text-muted">
                          {t.title}
                          <Lock size={16} className="ml-auto shrink-0" aria-hidden />
                        </h3>
                        <p className="text-sm text-muted mt-1">{t.description}</p>
                        <p className="text-sm mt-3 text-[color:var(--tone-warn)]">{e.reason}</p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="erledigt">
          <h2 id="erledigt" className="nv-mono mb-3">
            {open.length ? "Erledigte Anträge" : "Meine Anträge"} ({done.length})
          </h2>
          {done.length === 0 ? (
            <p className="text-sm text-muted">{mine.length ? "Noch nichts entschieden." : "Du hast noch keine Anträge gestellt."}</p>
          ) : (
            <ul className="nv-card divide-y divide-[color:var(--nv-border)] overflow-hidden">
              {done.map((r) => (
                <li key={r.id}>
                  <Link href={`/antraege/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-card-hover transition-colors">
                    <span className="flex-1 min-w-[200px]">
                      <span className="font-semibold block">{r.type.title}</span>
                      <span className="text-xs text-muted">
                        {r.publicId} · {r.decidedAt ? `entschieden ${formatRelative(r.decidedAt)}` : `eingereicht ${formatRelative(r.createdAt)}`}
                      </span>
                    </span>
                    <RequestStatusBadge status={r.status} outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
                    <ArrowRight size={14} className="text-muted" aria-hidden />
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
