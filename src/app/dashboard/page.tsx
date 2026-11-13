import type { Metadata } from "next";
import Link from "next/link";
import { DiscordLogo, Globe, Plus, Ticket } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/tickets/categories";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/status";
import { Container, EmptyState, PageHero, RequestStatusBadge, TicketStatusBadge, formatRelative } from "@/components/ui";

export const metadata: Metadata = { title: "Meine Tickets", robots: { index: false } };

export default async function DashboardPage() {
  const { user } = await requirePlayer("/dashboard");
  const [tickets, requests] = await Promise.all([
    db.ticket.findMany({ where: { creatorId: user.id }, orderBy: { updatedAt: "desc" }, take: 50, include: { _count: { select: { messages: { where: { kind: { in: ["TEAM", "PLAYER"] } } } } } } }),
    db.request.findMany({ where: { applicantId: user.id }, orderBy: { updatedAt: "desc" }, take: 10, include: { type: { select: { title: true } } } }),
  ]);
  const active = tickets.filter((t) => ACTIVE_TICKET_STATUSES.includes(t.status) || t.status === "RESOLVED");
  const done = tickets.filter((t) => t.status === "CLOSED");
  const waiting = tickets.filter((t) => t.status === "WAITING_PLAYER").length;

  const TicketRow = ({ t }: { t: (typeof tickets)[number] }) => (
    <li>
      <Link href={`/tickets/${t.id}`} className="nv-card nv-card-hover p-4 sm:p-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-muted" title={t.source === "DISCORD" ? "In Discord erstellt" : "Im Portal erstellt"}>
          {t.source === "DISCORD" ? <DiscordLogo size={20} aria-label="Discord" /> : <Globe size={20} aria-label="Portal" />}
        </span>
        <span className="flex-1 min-w-[200px]">
          <span className="font-semibold block">{t.subject}</span>
          <span className="text-xs text-muted">
            {t.publicId} · {categoryLabel(t.category)} · {t._count.messages} Nachrichten · aktualisiert {formatRelative(t.updatedAt)}
          </span>
        </span>
        <TicketStatusBadge status={t.status} />
      </Link>
    </li>
  );

  return (
    <>
      <PageHero
        label="Support // Dashboard"
        title={`Moin, ${user.globalName || user.username}.`}
        compact
        aside={
          <Link href="/tickets/neu" className="nv-btn nv-btn-primary">
            <Plus size={16} aria-hidden /> Neues Ticket
          </Link>
        }
      >
        Alle deine Tickets – egal ob im Portal oder per Discord erstellt.{waiting > 0 && <strong className="text-fg"> {waiting} {waiting === 1 ? "Ticket wartet" : "Tickets warten"} auf deine Antwort.</strong>}
      </PageHero>
      <Container>
        <section aria-labelledby="aktiv">
          <h2 id="aktiv" className="nv-mono mb-3">
            Offen ({active.length})
          </h2>
          {active.length === 0 ? (
            <EmptyState icon={Ticket} title="Keine offenen Tickets" action={<Link href="/" className="nv-btn nv-btn-ghost">Zum Hilfe-Center</Link>}>
              Alles ruhig. Wenn was ist: erst im Hilfe-Center suchen, dann Ticket aufmachen.
            </EmptyState>
          ) : (
            <ul className="grid gap-3">
              {active.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </ul>
          )}
        </section>

        {done.length > 0 && (
          <section aria-labelledby="erledigt" className="mt-10">
            <h2 id="erledigt" className="nv-mono mb-3">
              Geschlossen ({done.length})
            </h2>
            <ul className="grid gap-3">
              {done.map((t) => (
                <TicketRow key={t.id} t={t} />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="antraege" className="mt-10">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 id="antraege" className="nv-mono">
              Anträge ({requests.length})
            </h2>
            <Link href="/antraege" className="nv-link text-sm">
              Alle Anträge
            </Link>
          </div>
          {requests.length === 0 ? (
            <p className="text-sm text-muted">Keine Anträge.</p>
          ) : (
            <ul className="grid gap-3">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link href={`/antraege/${r.id}`} className="nv-card nv-card-hover p-4 flex flex-wrap items-center gap-3">
                    <span className="flex-1 min-w-[200px]">
                      <span className="font-semibold block">{r.type.title}</span>
                      <span className="text-xs text-muted">
                        {r.publicId} · {formatRelative(r.updatedAt)}
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
