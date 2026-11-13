import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Scales } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { displayAnswers, isOpen, parseFields } from "@/lib/requests/view";
import { Container, Notice, RequestStatusBadge, formatDay, formatDayTime } from "@/components/ui";
import { MessageList } from "@/components/tickets/MessageList";
import { RequestAnswerForm } from "@/components/requests/RequestAnswerForm";

export const metadata: Metadata = { title: "Antrag", robots: { index: false } };

const STEPS = ["SUBMITTED", "IN_REVIEW", "DECIDED"] as const;
const STEP_LABEL = { SUBMITTED: "Eingereicht", IN_REVIEW: "In Prüfung", DECIDED: "Entschieden" };

export default async function PlayerRequestPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { id } = await params;
  const { neu } = await searchParams;
  const { user } = await requireUser(`/antraege/${id}`);
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
  const current = r.status === "QUESTION" ? "IN_REVIEW" : r.status === "ARCHIVED" ? "DECIDED" : r.status;
  const stepIndex = STEPS.indexOf(current as (typeof STEPS)[number]);

  return (
    <Container className="pt-32 sm:pt-36">
      <Link href="/antraege" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Meine Anträge
      </Link>
      {neu && (
        <Notice tone="success" title="Antrag ist eingereicht" className="mt-4">
          Bitte nicht doppelt einreichen. Rückfragen und die Entscheidung siehst du hier (und per DM, falls möglich).
        </Notice>
      )}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <p className="nv-label">
            {r.publicId}{" // "}{r.type.title}
          </p>
          <h1 className="nv-headline text-3xl sm:text-4xl mt-3">{r.type.title}</h1>

          <ol className="mt-6 flex flex-wrap gap-2" aria-label="Ablauf">
            {STEPS.map((s, k) => (
              <li key={s} className={`nv-pill ${k <= stepIndex ? "nv-tone-accent" : "nv-tone-muted"}`} aria-current={k === stepIndex ? "step" : undefined}>
                {k + 1}. {STEP_LABEL[s]}
              </li>
            ))}
          </ol>

          {r.status === "QUESTION" && (
            <Notice tone="warn" title="Rückfrage an dich" className="mt-6">
              Das Team braucht noch etwas von dir – siehe unten. Bis du antwortest, ruht dein Antrag.
            </Notice>
          )}

          {r.decidedAt && r.outcomeLabel && (
            <section className="mt-6 nv-card p-6 border-red-line" aria-labelledby="entscheidung">
              <h2 id="entscheidung" className="flex items-center gap-2 font-semibold">
                <Scales size={20} className="text-red-text" aria-hidden /> Entscheidung: {r.outcomeLabel}
              </h2>
              <p className="text-sm text-muted mt-1">{formatDayTime(r.decidedAt)}</p>
              <p className="mt-4 whitespace-pre-line">{r.decisionReason}</p>
            </section>
          )}

          <section className="mt-8" aria-labelledby="verlauf">
            <h2 id="verlauf" className="nv-mono mb-3">
              Verlauf
            </h2>
            <MessageList messages={r.messages.map((m) => ({ ...m, source: "WEB" as const, attachments: [] }))} perspective="player" />
          </section>

          {isOpen(r.status) && (
            <div className="mt-6">
              <RequestAnswerForm requestId={r.id} question={r.status === "QUESTION"} />
            </div>
          )}
        </div>
        <aside className="space-y-4 lg:sticky lg:top-28 self-start">
          <div className="nv-card p-5 text-sm space-y-2">
            <div className="flex justify-between gap-2 items-center">
              <span className="text-muted">Status</span>
              <RequestStatusBadge status={r.status} outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Eingereicht</span>
              <span>{formatDay(r.createdAt)}</span>
            </div>
          </div>
          <div className="nv-card p-5">
            <p className="nv-mono mb-3">Deine Angaben</p>
            <dl className="space-y-3 text-sm">
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
                        {a.provider}
                      </a>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </Container>
  );
}
