import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { canSeeSanctions, requestTeamWhere, ticketTeamWhere } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { categoryLabel } from "@/lib/tickets/categories";
import { listTeamMembers } from "@/lib/team/queries";
import { Avatar, Notice, RequestStatusBadge, Stat, TicketStatusBadge, formatDay, formatDayTime, formatRelative } from "@/components/ui";
import { NoteForm, SanctionForm, LiftSanctionButton } from "@/components/team/PlayerForms";

export const metadata: Metadata = { title: "Spielerprofil" };

const KIND_LABEL = { BAN: "Bann", WARNING: "Verwarnung", KICK: "Kick", JAIL: "Jail", FINE: "Geldstrafe" } as const;

export default async function PlayerProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, access } = await requireTeam();
  const viewer = viewerOf(user, access.teamLevel);
  const p = await db.user.findUnique({ where: { id } });
  if (!p) notFound();
  const types = await db.requestType.findMany();
  const self = p.id === user.id;
  // Eigenes Profil: keine Notizen/Strafen über sich selbst (könnten Beschwerden betreffen)
  const showSanctions = canSeeSanctions(viewer) && !self;
  // Nur was die Person sehen darf – Beschwerden über sie selbst bleiben unsichtbar
  const [tickets, requests, notes, sanctions, members] = await Promise.all([
    db.ticket.findMany({ where: { AND: [ticketTeamWhere(viewer), { creatorId: p.id }] }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.request.findMany({ where: { AND: [requestTeamWhere(viewer, types), { applicantId: p.id }] }, orderBy: { createdAt: "desc" }, include: { type: { select: { title: true } } } }),
    self ? Promise.resolve([]) : db.playerNote.findMany({ where: { subjectId: p.id }, orderBy: { createdAt: "desc" }, include: { author: { select: { globalName: true, username: true } } } }),
    showSanctions ? db.sanction.findMany({ where: { subjectDiscordId: p.discordId }, orderBy: { startsAt: "desc" } }) : Promise.resolve([]),
    listTeamMembers(),
  ]);
  const name = (u: { globalName: string | null; username: string }) => u.globalName || u.username;
  const avgRating = tickets.filter((t) => t.rating).reduce((s, t, _i, a) => s + (t.rating ?? 0) / a.length, 0);

  return (
    <div className="space-y-8">
      <Link href="/team/spieler" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Alle Spieler
      </Link>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar discordId={p.discordId} avatar={p.avatar} size={64} />
        <div>
          <p className="nv-label">Team // Spielerprofil</p>
          <h1 className="nv-headline text-4xl mt-2">{name(p)}</h1>
          <p className="text-sm text-muted mt-1">
            @{p.username} · <span className="font-mono">{p.discordId}</span> · dabei seit {formatDay(p.createdAt)}
            {p.teamLevel !== "NONE" && ` · Team: ${LEVEL_LABEL[p.teamLevel]}`}
          </p>
        </div>
      </div>
      {p.guildBanned && <Notice tone="danger" title="Vom Discord gebannt">{p.guildBanReason ?? "Kein Grund hinterlegt."}</Notice>}
      {!p.inGuild && !p.guildBanned && <Notice tone="info">Nicht (mehr) auf unserem Discord – DMs erreichen die Person evtl. nicht.</Notice>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Tickets" value={tickets.length} hint="die du sehen darfst" />
        <Stat label="Anträge" value={requests.length} />
        <Stat label="Ø Bewertung" value={avgRating ? avgRating.toFixed(1) : "–"} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="tickets">
          <h2 id="tickets" className="nv-mono mb-3">
            Tickets
          </h2>
          <ul className="grid gap-2">
            {tickets.map((t) => (
              <li key={t.id}>
                <Link href={`/team/tickets/${t.id}`} className="nv-card nv-card-hover p-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1 min-w-[180px]">
                    <span className="block font-medium">{t.subject}</span>
                    <span className="text-xs text-muted">
                      {t.publicId} · {categoryLabel(t.category)} · {formatRelative(t.createdAt)}
                    </span>
                  </span>
                  <TicketStatusBadge status={t.status} team />
                </Link>
              </li>
            ))}
            {!tickets.length && <li className="text-sm text-muted">Keine.</li>}
          </ul>
        </section>
        <section aria-labelledby="antraege">
          <h2 id="antraege" className="nv-mono mb-3">
            Anträge
          </h2>
          <ul className="grid gap-2">
            {requests.map((r) => (
              <li key={r.id}>
                <Link href={`/team/antraege/${r.id}`} className="nv-card nv-card-hover p-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1">
                    <span className="block font-medium">{r.type.title}</span>
                    <span className="text-xs text-muted">
                      {r.publicId} · {formatRelative(r.createdAt)}
                    </span>
                  </span>
                  <RequestStatusBadge status={r.status} team outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
                </Link>
              </li>
            ))}
            {!requests.length && <li className="text-sm text-muted">Keine.</li>}
          </ul>
        </section>
      </div>

      {showSanctions && (
        <section aria-labelledby="strafen" className="nv-card p-5">
          <h2 id="strafen" className="nv-mono mb-3">
            Banns &amp; Verwarnungen (nur Moderation/Leitung)
          </h2>
          <ul className="space-y-3">
            {sanctions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-start gap-3 text-sm border-b border-line pb-3">
                <span className={`nv-pill ${s.liftedAt ? "nv-tone-muted" : s.kind === "BAN" ? "nv-tone-danger" : "nv-tone-warn"}`}>{KIND_LABEL[s.kind]}</span>
                <span className="flex-1 min-w-[200px]">
                  {s.reason}
                  <span className="block text-xs text-muted">
                    {formatDayTime(s.startsAt)}
                    {s.endsAt ? ` bis ${formatDayTime(s.endsAt)}` : ""}
                    {s.externalId ? ` · ID ${s.externalId}` : ""}
                    {s.banType ? ` · ${s.banType}` : ""}
                    {s.issuedByName ? ` · von ${s.issuedByName}` : ""} · Quelle {s.source}
                    {s.liftedAt ? ` · aufgehoben ${formatDay(s.liftedAt)}${s.liftedNote ? ` (${s.liftedNote})` : ""}` : ""}
                  </span>
                </span>
                {!s.liftedAt && <LiftSanctionButton sanctionId={s.id} />}
              </li>
            ))}
            {!sanctions.length && <li className="text-sm text-muted">Keine eingetragen.</li>}
          </ul>
          <SanctionForm subjectId={p.id} team={members.map((m) => ({ id: m.id, name: m.globalName || m.username }))} />
        </section>
      )}

      {!self && (
      <section aria-labelledby="notizen" className="nv-card p-5">
        <h2 id="notizen" className="nv-mono mb-3">
          Interne Notizen
        </h2>
        <ul className="space-y-3 mb-4">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <span className="font-medium">{n.author ? name(n.author) : "Gelöschtes Konto"}</span> <span className="text-xs text-muted">{formatRelative(n.createdAt)}</span>
              <p className="text-fg-2 whitespace-pre-line">{n.body}</p>
            </li>
          ))}
          {!notes.length && <li className="text-sm text-muted">Noch keine Notizen.</li>}
        </ul>
        <NoteForm subjectId={p.id} />
      </section>
      )}
    </div>
  );
}
