import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Scales } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { checkApproval, requestTeamWhere, ticketTeamWhere } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { categoryLabel } from "@/lib/tickets/categories";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/status";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { EmptyState, Notice, PriorityBadge, RequestStatusBadge, Stat, TicketStatusBadge, formatRelative } from "@/components/ui";

export const metadata: Metadata = { title: "Übersicht" };

export default async function TeamHome({ searchParams }: { searchParams: Promise<{ hinweis?: string }> }) {
  const { user, access } = await requireTeam();
  // Fällige Aufgaben (Erinnerungen, Auto-Schließen …) nur hier, auf Abruf des Teams
  await import("@/lib/housekeeping").then((m) => m.scheduleHousekeeping()).catch(() => {});
  const { hinweis } = await searchParams;
  const viewer = viewerOf(user, access.teamLevel);
  const vis = ticketTeamWhere(viewer);
  const types = await db.requestType.findMany();
  const reqVis = requestTeamWhere(viewer, types);

  const [mine, free, waiting, openCount, openRequests, pending] = await Promise.all([
    db.ticket.findMany({ where: { AND: [vis, { claimedById: user.id, status: { in: ACTIVE_TICKET_STATUSES } }] }, orderBy: { updatedAt: "desc" }, take: 10 }),
    db.ticket.findMany({ where: { AND: [vis, { claimedById: null, status: { in: ["OPEN", "IN_PROGRESS"] } }] }, orderBy: [{ priority: "desc" }, { createdAt: "asc" }], take: 10 }),
    db.ticket.count({ where: { AND: [vis, { status: "WAITING_PLAYER" }] } }),
    db.ticket.count({ where: { AND: [vis, { status: { in: ACTIVE_TICKET_STATUSES } }] } }),
    db.request.findMany({ where: { AND: [reqVis, { status: { in: ["SUBMITTED", "IN_REVIEW", "QUESTION"] } }] }, orderBy: { createdAt: "asc" }, take: 10, include: { type: true } }),
    db.requestDecision.findMany({ where: { status: "PENDING", request: reqVis }, include: { request: { include: { type: true } }, proposedBy: { select: { globalName: true, username: true } } }, take: 20 }),
  ]);
  const toApprove = pending.filter((d) => checkApproval(viewer, d.request.type, d.request, d).ok);

  return (
    <div className="space-y-10">
      <div>
        <p className="nv-label">Team // Übersicht</p>
        <h1 className="nv-headline text-4xl mt-3">
          Moin, <em>{user.globalName || user.username}.</em>
        </h1>
        <p className="text-muted mt-2">Stufe: {LEVEL_LABEL[access.teamLevel]}</p>
      </div>
      {hinweis === "rechte" && <Notice tone="warn">Dafür fehlen dir die Rechte (Stufe zu niedrig).</Notice>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Offene Tickets" value={openCount} />
        <Stat label="Wartet auf Spieler" value={waiting} />
        <Stat label="Offene Anträge" value={openRequests.length} hint="die du sehen darfst" />
        <Stat label="Zur Bestätigung" value={toApprove.length} hint="Vier-Augen-Prinzip" />
      </div>

      {toApprove.length > 0 && (
        <section aria-labelledby="bestaetigen">
          <h2 id="bestaetigen" className="nv-headline text-2xl flex items-center gap-2">
            <Scales size={24} className="text-red-text" aria-hidden /> Wartet auf <em>deine Zustimmung</em>
          </h2>
          <ul className="mt-4 grid gap-3">
            {toApprove.map((d) => (
              <li key={d.id}>
                <Link href={`/team/antraege/${d.requestId}#entscheidung`} className="nv-card nv-card-hover p-4 flex flex-wrap items-center gap-3">
                  <span className="flex-1 min-w-[220px]">
                    <span className="font-semibold block">
                      {d.request.publicId} · {d.request.type.title}
                    </span>
                    <span className="text-sm text-muted">
                      Vorschlag von {d.proposedBy.globalName || d.proposedBy.username}: {d.outcomeKey} · {formatRelative(d.createdAt)}
                    </span>
                  </span>
                  <ArrowRight size={16} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="meine">
          <h2 id="meine" className="nv-mono mb-3">
            Meine Tickets ({mine.length})
          </h2>
          {mine.length === 0 ? (
            <EmptyState title="Nichts übernommen">Schnapp dir eins von rechts.</EmptyState>
          ) : (
            <TicketList items={mine} />
          )}
        </section>
        <section aria-labelledby="frei">
          <h2 id="frei" className="nv-mono mb-3">
            Frei ({free.length})
          </h2>
          {free.length === 0 ? <EmptyState title="Keine freien Tickets">Alles verteilt. 🎉</EmptyState> : <TicketList items={free} />}
        </section>
      </div>

      <section aria-labelledby="antraege">
        <div className="flex items-center justify-between mb-3">
          <h2 id="antraege" className="nv-mono">
            Offene Anträge (älteste zuerst)
          </h2>
          <Link href="/team/antraege" className="nv-link text-sm">
            Alle Anträge
          </Link>
        </div>
        {openRequests.length === 0 ? (
          <p className="text-sm text-muted">Keine offenen Anträge.</p>
        ) : (
          <ul className="grid gap-2">
            {openRequests.map((r) => (
              <li key={r.id}>
                <Link href={`/team/antraege/${r.id}`} className="nv-card nv-card-hover p-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-mono text-xs text-muted">{r.publicId}</span>
                  <span className="flex-1">{r.type.title}</span>
                  <RequestStatusBadge status={r.status} team />
                  <span className="text-muted">{formatRelative(r.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TicketList({ items }: { items: { id: string; publicId: string; subject: string; category: string; status: import("@prisma/client").TicketStatus; priority: import("@prisma/client").TicketPriority; updatedAt: Date }[] }) {
  return (
    <ul className="grid gap-2">
      {items.map((t) => (
        <li key={t.id}>
          <Link href={`/team/tickets/${t.id}`} className="nv-card nv-card-hover p-3 block">
            <span className="font-medium block text-sm">{t.subject}</span>
            <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
              <span className="font-mono">{t.publicId}</span> · {categoryLabel(t.category)} · {formatRelative(t.updatedAt)}
              <TicketStatusBadge status={t.status} team className="!text-[0.65rem] !py-0" />
              <PriorityBadge priority={t.priority} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
