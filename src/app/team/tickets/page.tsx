import type { Metadata } from "next";
import Link from "next/link";
import { DiscordLogo, Kanban, ListBullets, LockSimple } from "@phosphor-icons/react/ssr";
import { requireTeam } from "@/lib/auth/session";
import { listTeamTickets, parseTicketFilters } from "@/lib/team/queries";
import { viewerOf } from "@/lib/tickets/service";
import { TICKET_CATEGORIES, categoryLabel } from "@/lib/tickets/categories";
import { PRIORITIES, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL_TEAM } from "@/lib/tickets/status";
import { EmptyState, PriorityBadge, TicketStatusBadge, formatRelative } from "@/components/ui";
import { TicketKanban } from "@/components/team/TicketKanban";

export const metadata: Metadata = { title: "Tickets" };

export default async function TeamTicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user, access } = await requireTeam();
  const sp = await searchParams;
  const kanban = sp.ansicht === "kanban";
  const filters = parseTicketFilters(sp);
  // Kanban zeigt auch geschlossene (letzte), Liste nach Filter
  const tickets = await listTeamTickets(viewerOf(user, access.teamLevel), kanban ? { ...filters, status: "alle" } : filters, kanban ? 150 : 200);
  const name = (u: { globalName: string | null; username: string } | null) => (u ? u.globalName || u.username : null);
  const qs = (patch: Record<string, string>) => {
    const p = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `?${p.toString()}`;
  };

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nv-label">Team // Tickets</p>
          <h1 className="nv-headline text-4xl mt-3">
            Tickets <em>({tickets.length})</em>
          </h1>
        </div>
        <div className="flex gap-1" role="group" aria-label="Ansicht">
          <Link href={qs({ ansicht: "" })} className={`nv-btn nv-btn-sm ${!kanban ? "nv-btn-primary" : "nv-btn-ghost"}`} aria-current={!kanban ? "page" : undefined}>
            <ListBullets size={16} aria-hidden /> Liste
          </Link>
          <Link href={qs({ ansicht: "kanban" })} className={`nv-btn nv-btn-sm ${kanban ? "nv-btn-primary" : "nv-btn-ghost"}`} aria-current={kanban ? "page" : undefined}>
            <Kanban size={16} aria-hidden /> Kanban
          </Link>
        </div>
      </div>

      <form className="mt-6 nv-card p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6 items-end" method="get">
        {kanban && <input type="hidden" name="ansicht" value="kanban" />}
        <label className="lg:col-span-2">
          <span className="nv-field-label">Suche</span>
          <input name="q" defaultValue={filters.q} className="nv-input mt-1" placeholder="ID, Betreff, Spieler, Text …" />
        </label>
        {!kanban && (
          <label>
            <span className="nv-field-label">Status</span>
            <select name="status" defaultValue={filters.status} className="nv-input mt-1">
              <option value="aktiv">Aktiv (nicht geschlossen)</option>
              <option value="alle">Alle</option>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TICKET_STATUS_LABEL_TEAM[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="nv-field-label">Kategorie</span>
          <select name="kategorie" defaultValue={filters.category} className="nv-input mt-1">
            <option value="">Alle</option>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="nv-field-label">Priorität</span>
          <select name="prio" defaultValue={filters.priority} className="nv-input mt-1">
            <option value="">Alle</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="nv-field-label">Zugewiesen</span>
          <select name="zugewiesen" defaultValue={filters.assigned} className="nv-input mt-1">
            <option value="">Alle</option>
            <option value="me">Mir</option>
            <option value="free">Niemandem</option>
          </select>
        </label>
        <div className="flex gap-2 lg:col-span-6">
          {filters.tag && <input type="hidden" name="tag" value={filters.tag} />}
          <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm">
            Filtern
          </button>
          <Link href={kanban ? "?ansicht=kanban" : "?"} className="nv-btn nv-btn-ghost nv-btn-sm">
            Zurücksetzen
          </Link>
          {filters.tag && <span className="nv-pill nv-tone-accent">#{filters.tag}</span>}
        </div>
      </form>

      <div className="mt-6">
        {tickets.length === 0 ? (
          <EmptyState title="Keine Tickets">Nichts gefunden – oder alles erledigt. 🎉</EmptyState>
        ) : kanban ? (
          <TicketKanban
            items={tickets.map((t) => ({
              id: t.id,
              publicId: t.publicId,
              subject: t.subject,
              status: t.status,
              priority: t.priority,
              category: t.category,
              player: name(t.creator)!,
              claimedBy: name(t.claimedBy),
              discord: !!t.discordThreadId,
              sensitive: t.sensitivity !== "NORMAL",
              tags: t.tags,
            }))}
          />
        ) : (
          <div className="nv-card nv-scroll-x">
            <table className="nv-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Spieler</th>
                  <th>Status</th>
                  <th>Priorität</th>
                  <th>Betreut</th>
                  <th>Aktualisiert</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <Link href={`/team/tickets/${t.id}`} className="font-medium hover:text-red-text">
                        {t.subject}
                      </Link>
                      <div className="text-xs text-muted flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="font-mono">{t.publicId}</span> · {categoryLabel(t.category)}
                        {t.discordThreadId && <DiscordLogo size={12} aria-label="Discord-Thread" />}
                        {t.sensitivity !== "NORMAL" && (
                          <span className="nv-pill nv-tone-danger !text-[0.62rem] !py-0">
                            <LockSimple size={10} aria-hidden /> vertraulich
                          </span>
                        )}
                        {t.tags.map((tag) => (
                          <Link key={tag} href={qs({ tag })} className="nv-pill nv-tone-muted !text-[0.62rem] !py-0">
                            #{tag}
                          </Link>
                        ))}
                      </div>
                    </td>
                    <td>
                      <Link href={`/team/spieler/${t.creator.id}`} className="hover:text-red-text">
                        {name(t.creator)}
                      </Link>
                    </td>
                    <td>
                      <TicketStatusBadge status={t.status} team />
                    </td>
                    <td>
                      <PriorityBadge priority={t.priority} />
                    </td>
                    <td className="text-sm">{name(t.claimedBy) ?? <span className="text-muted">frei</span>}</td>
                    <td className="text-sm text-muted">{formatRelative(t.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
