import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChatCircleDots, CheckCircle, FilePdf, LinkSimple, Scales, XCircle } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { displayAnswers, isOpen, parseFields } from "@/lib/requests/view";
import { Container, Notice, RequestStatusBadge, cn, formatDay, formatDayTime } from "@/components/ui";
import { IconTile } from "@/components/icons";
import { RequestAnswerForm } from "@/components/requests/RequestAnswerForm";
import { RequestProgress } from "@/components/requests/RequestProgress";
import { LiveMessages, LiveThreadProvider } from "@/components/live/Live";
import { liveScopeQuery, liveVersion, type LiveScope } from "@/lib/live";
import { viewerOf } from "@/lib/tickets/service";
import { hasCertificate } from "@/lib/requests/certificate";
import { certificateUrl } from "@/lib/requests/certificate-db";

export const metadata: Metadata = { title: "Antrag", robots: { index: false } };

export default async function PlayerRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { id } = await params;
  const { neu } = await searchParams;
  const { user } = await requireUser(`/antraege/${id}`);
  // Version VOR den Daten lesen (prüft zugleich, dass es der eigene Antrag ist)
  const scope: LiveScope = { type: "request", id, perspective: "player" };
  const version = await liveVersion(scope, viewerOf(user, "NONE"));
  if (version === null) notFound();
  const r = await db.request.findUnique({
    where: { id },
    include: {
      type: true,
      messages: { where: { kind: { in: ["PLAYER", "TEAM", "SYSTEM"] } }, orderBy: { createdAt: "asc" } },
      attachments: { select: { id: true, kind: true, url: true, provider: true, fileName: true } },
    },
  });
  if (!r || r.applicantId !== user.id) notFound();
  const answers = displayAnswers(parseFields(r.type.fields), r.answers);
  const decided = !!r.decidedAt && !!r.outcomeLabel;
  const tone = r.outcomeCategory === "ACCEPTED" ? "success" : r.outcomeCategory === "REJECTED" ? "danger" : "neutral";
  const OutcomeIcon = r.outcomeCategory === "ACCEPTED" ? CheckCircle : r.outcomeCategory === "REJECTED" ? XCircle : Scales;
  // Gleiche Nachricht wie die Entscheidung nicht doppelt im Verlauf zeigen
  const messages = r.messages
    .filter((m) => !(decided && m.kind === "SYSTEM" && m.body.startsWith("Entscheidung:")))
    .map((m) => ({ ...m, source: "WEB" as const, attachments: [] }));

  return (
    <LiveThreadProvider query={liveScopeQuery(scope)} version={version} viewerName={user.globalName || user.username}>
      <Container className="pt-28 sm:pt-32 pb-16">
        <Link href="/antraege" className="nv-btn nv-btn-quiet nv-btn-sm">
          <ArrowLeft size={14} aria-hidden /> Meine Anträge
        </Link>

        {neu && (
          <Notice tone="success" icon={CheckCircle} title="Antrag ist eingereicht" className="mt-4">
            Bitte nicht doppelt einreichen. Rückfragen und die Entscheidung siehst du hier – und per DM, falls möglich.
          </Notice>
        )}

        <header className="mt-6 flex flex-wrap items-start gap-4">
          <IconTile name={r.type.icon} />
          <div className="flex-1 min-w-[14rem]">
            <p className="nv-label">{r.publicId}</p>
            <h1 className="nv-headline text-3xl sm:text-4xl mt-3">{r.type.title}</h1>
          </div>
          <RequestStatusBadge status={r.status} outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
        </header>

        <div className="mt-8 nv-card p-5 sm:p-6">
          <RequestProgress status={r.status} createdAt={r.createdAt} decidedAt={r.decidedAt} outcomeCategory={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-8">
            {r.status === "QUESTION" && (
              <Notice tone="warn" icon={ChatCircleDots} title="Rückfrage an dich">
                Das Team braucht noch etwas von dir – siehe Verlauf. Bis du antwortest, ruht dein Antrag.
              </Notice>
            )}

            {decided && (
              <section
                aria-labelledby="entscheidung"
                className={cn(
                  "rounded-2xl border p-6",
                  tone === "success" && "border-[color:var(--tone-success)] bg-[color:var(--tone-success-bg)]",
                  tone === "danger" && "border-[color:var(--tone-danger)] bg-[color:var(--tone-danger-bg)]",
                  tone === "neutral" && "border-line-strong bg-card",
                )}
              >
                <h2 id="entscheidung" className="flex items-center gap-2 text-lg font-semibold">
                  <OutcomeIcon
                    size={24}
                    weight="fill"
                    className={cn(tone === "success" && "text-[color:var(--tone-success)]", tone === "danger" && "text-[color:var(--tone-danger)]", tone === "neutral" && "text-muted")}
                    aria-hidden
                  />
                  {r.outcomeLabel}
                </h2>
                <p className="text-sm text-muted mt-1">Entschieden am {formatDayTime(r.decidedAt)}</p>
                {r.decisionReason && (
                  <div className="mt-4">
                    <p className="nv-mono mb-1">Begründung</p>
                    <p className="whitespace-pre-line text-fg-2">{r.decisionReason}</p>
                  </div>
                )}
                {hasCertificate(r) && (
                  <div className="mt-5 rounded-xl border border-line bg-[color:var(--nv-bg)] p-4 flex flex-wrap items-center gap-4">
                    <FilePdf size={32} className="text-red-text shrink-0" aria-hidden />
                    <div className="flex-1 min-w-[12rem]">
                      <p className="font-semibold">Dein Bescheid fürs Rathaus</p>
                      <p className="text-sm text-muted">Herunterladen und ingame im Rathaus abgeben – dort bekommst du neue Papiere auf deinen neuen Namen.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={certificateUrl(r.id)} className="nv-btn nv-btn-primary nv-btn-sm" download>
                        <FilePdf size={14} aria-hidden /> PDF herunterladen
                      </a>
                      <a href={`${certificateUrl(r.id)}?ansehen=1`} target="_blank" rel="noopener" className="nv-btn nv-btn-ghost nv-btn-sm">
                        Ansehen
                      </a>
                    </div>
                  </div>
                )}
              </section>
            )}

            {(messages.length > 0 || isOpen(r.status)) && (
              <section aria-labelledby="verlauf">
                <h2 id="verlauf" className="nv-mono mb-4">
                  Verlauf
                </h2>
                {messages.length === 0 && <p className="text-sm text-muted mb-2">Noch keine Nachrichten. Rückfragen vom Team erscheinen hier automatisch.</p>}
                <LiveMessages messages={messages} perspective="player" />
              </section>
            )}

            {isOpen(r.status) && <RequestAnswerForm requestId={r.id} question={r.status === "QUESTION"} />}
          </div>

          <aside className="space-y-4 self-start">
            <div className="nv-card p-5 text-sm space-y-2.5">
              <div className="flex justify-between gap-2">
                <span className="text-muted">Nummer</span>
                <span className="font-mono">{r.publicId}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted">Eingereicht</span>
                <span>{formatDay(r.createdAt)}</span>
              </div>
              {r.decidedAt && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted">Entschieden</span>
                  <span>{formatDay(r.decidedAt)}</span>
                </div>
              )}
            </div>
            <details className="nv-card p-5 group" open>
              <summary className="nv-mono cursor-pointer list-none flex items-center justify-between">
                Deine Angaben <span className="text-faint group-open:rotate-180 transition-transform" aria-hidden>▾</span>
              </summary>
              <dl className="mt-4 space-y-3 text-sm">
                {answers.map((a) => (
                  <div key={a.key}>
                    <dt className="text-muted">{a.label}</dt>
                    <dd className="whitespace-pre-line break-words">{a.value}</dd>
                  </div>
                ))}
              </dl>
              {r.attachments.length > 0 && (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {r.attachments.map((a) =>
                    a.kind === "IMAGE" ? (
                      <li key={a.id}>
                        <a href={`/api/uploads/${a.id}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/uploads/${a.id}`} alt={a.fileName ?? "Beleg"} className="h-16 w-16 object-cover rounded-lg border border-line" />
                        </a>
                      </li>
                    ) : (
                      <li key={a.id}>
                        <a href={a.url ?? "#"} className="nv-pill nv-tone-info !normal-case" target="_blank" rel="noopener noreferrer nofollow">
                          <LinkSimple size={12} aria-hidden /> {a.provider}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </details>
          </aside>
        </div>
      </Container>
    </LiveThreadProvider>
  );
}
