import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DiscordLogo, FileText } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { syncTicketFromDiscord } from "@/lib/tickets/sync-db";
import { categoryLabel, displayFields } from "@/lib/tickets/categories";
import { Container, Notice, TicketStatusBadge, formatDayTime } from "@/components/ui";
import { MessageList } from "@/components/tickets/MessageList";
import { PlayerTicketActions } from "@/components/tickets/PlayerTicketActions";

export const metadata: Metadata = { title: "Ticket", robots: { index: false } };

export default async function PlayerTicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ neu?: string }> }) {
  const { id } = await params;
  const { neu } = await searchParams;
  const { user } = await requirePlayer(`/tickets/${id}`);
  const t0 = await db.ticket.findUnique({ where: { id }, select: { creatorId: true } });
  if (!t0 || t0.creatorId !== user.id) notFound();
  // Discord → Web: neue Thread-Nachrichten abholen (gedrosselt, max. 2,5 s)
  await syncTicketFromDiscord(id);
  const t = await db.ticket.findUniqueOrThrow({
    where: { id },
    include: {
      messages: { where: { kind: { not: "INTERNAL" } }, orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, kind: true, url: true, provider: true, fileName: true } } } },
      claimedBy: { select: { globalName: true, username: true } },
    },
  });
  const fields = displayFields(t.category, t.fields);

  return (
    <Container className="pt-32 sm:pt-36">
      <Link href="/dashboard" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Meine Tickets
      </Link>
      {neu && (
        <Notice tone="success" title="Ticket ist da!" className="mt-4">
          Wir melden uns hier{t.discordThreadId || t.sensitivity !== "TEAM_COMPLAINT" ? " und in deinem privaten Discord-Thread" : ""}. Bei jeder Antwort bekommst du eine DM vom NV Lotse (abschaltbar unter Konto).
        </Notice>
      )}
      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">
          <p className="nv-label">
            {t.publicId}{" // "}{categoryLabel(t.category)}
          </p>
          <h1 className="nv-headline text-3xl sm:text-4xl mt-3 break-words">{t.subject}</h1>
          <div className="mt-8">
            <MessageList messages={t.messages} perspective="player" />
          </div>
          <div className="mt-8">
            <PlayerTicketActions ticketId={t.id} status={t.status} rating={t.rating} ratingComment={t.ratingComment} />
          </div>
        </div>
        <aside className="space-y-4 lg:sticky lg:top-28 self-start">
          <div className="nv-card p-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Status</span>
              <TicketStatusBadge status={t.status} />
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Erstellt</span>
              <span>{formatDayTime(t.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted">Betreut von</span>
              <span>{t.claimedBy ? t.claimedBy.globalName || t.claimedBy.username : "noch niemand"}</span>
            </div>
            {t.discordThreadId && (
              <p className="flex items-center gap-2 text-muted">
                <DiscordLogo size={16} aria-hidden /> Läuft auch als privater Thread in Discord.
              </p>
            )}
            {t.status === "CLOSED" && t.transcript && (
              <Link href={`/tickets/${t.id}/transkript`} className="nv-btn nv-btn-ghost nv-btn-sm w-full">
                <FileText size={16} aria-hidden /> Transkript
              </Link>
            )}
          </div>
          {fields.length > 0 && (
            <div className="nv-card p-5">
              <p className="nv-mono mb-3">Deine Angaben</p>
              <dl className="space-y-2 text-sm">
                {fields.map((f) => (
                  <div key={f.label}>
                    <dt className="text-muted">{f.label}</dt>
                    <dd className="break-words">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </div>
    </Container>
  );
}
