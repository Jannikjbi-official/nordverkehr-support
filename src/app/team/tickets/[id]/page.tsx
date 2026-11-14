import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DiscordLogo, FileText, LockSimple, ShieldWarning } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { requireTeam } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { canReceiveTicket, teamCanSeeTicket } from "@/lib/perms";
import { audit } from "@/lib/audit";
import { categoryLabel, displayFields } from "@/lib/tickets/categories";
import { viewerOf } from "@/lib/tickets/service";
import { PRIORITY_LABEL, TICKET_STATUS_LABEL_TEAM } from "@/lib/tickets/status";
import { listTeamMembers } from "@/lib/team/queries";
import { Avatar, Notice, PriorityBadge, TicketStatusBadge, formatDayTime, formatRelative } from "@/components/ui";
import { LiveMessages, LiveThreadProvider } from "@/components/live/Live";
import { liveChannels, type LiveChannelScope } from "@/lib/live-channels";
import { TicketComposer, TicketSideControls } from "@/components/team/TicketControls";

export const metadata: Metadata = { title: "Ticket" };

const EVENT_LABEL: Record<string, string> = { created: "erstellt", status: "Status", claim: "übernommen", release: "freigegeben", transfer: "weitergegeben", priority: "Priorität" };

export default async function TeamTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, access } = await requireTeam();
  const viewer = viewerOf(user, access.teamLevel);
  const scope: LiveChannelScope = { type: "ticket", id, perspective: "team" };
  const t0 = await db.ticket.findUnique({ where: { id } });
  // Beschuldigte/zu niedrige Stufe: wie „nicht vorhanden“ behandeln (kein Hinweis auf Existenz)
  if (!t0 || !teamCanSeeTicket(viewer, t0)) notFound();
  if (t0.sensitivity !== "NORMAL") await audit("ticket.view", { actorId: user.id, targetType: "ticket", targetId: t0.id });

  const [t, settings, members, templates, events, otherTickets] = await Promise.all([
    db.ticket.findUniqueOrThrow({
      where: { id },
      include: {
        creator: true,
        claimedBy: { select: { id: true, globalName: true, username: true } },
        messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, kind: true, url: true, provider: true, fileName: true } } } },
      },
    }),
    getSettings(),
    listTeamMembers(),
    db.messageTemplate.findMany({ where: { scope: { in: ["ticket", "all"] } }, orderBy: { order: "asc" } }),
    db.ticketEvent.findMany({ where: { ticketId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.ticket.count({ where: { creatorId: t0.creatorId, NOT: { id } } }),
  ]);
  const fields = displayFields(t.category, t.fields);
  const name = (u: { globalName: string | null; username: string }) => u.globalName || u.username;
  const accusedUserIds = members.filter((m) => t.accusedDiscordIds.includes(m.discordId)).map((m) => m.id);
  const relevantTemplates = templates.filter((x) => !x.ticketCategory || x.ticketCategory === t.category);

  return (
    <LiveThreadProvider channels={liveChannels(scope)} viewerName={user.globalName || user.username}>
      <div>
        <Link href="/team/tickets" className="nv-btn nv-btn-quiet nv-btn-sm">
          <ArrowLeft size={14} aria-hidden /> Alle Tickets
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="nv-label">
              {t.publicId}{" // "}{categoryLabel(t.category)}
            </p>
            <h1 className="nv-headline text-3xl sm:text-4xl mt-3 break-words">{t.subject}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <TicketStatusBadge status={t.status} team />
              <PriorityBadge priority={t.priority} />
              {t.source === "DISCORD" && (
                <span className="nv-pill nv-tone-info">
                  <DiscordLogo size={12} aria-hidden /> per Discord erstellt
                </span>
              )}
              {t.sensitivity !== "NORMAL" && (
                <span className="nv-pill nv-tone-danger">
                  <LockSimple size={12} aria-hidden /> {t.sensitivity === "TEAM_COMPLAINT" ? "Beschwerde über Teammitglied" : "Nur Moderation/Leitung"}
                </span>
              )}
            </div>
          </div>
        </div>

        {t.sensitivity === "TEAM_COMPLAINT" && (
          <Notice tone="warn" icon={ShieldWarning} title="Vertraulich" className="mt-4">
            Beschwerde über ein Teammitglied. Die beschuldigte Person sieht dieses Ticket nicht. Bitte nichts weitererzählen.
            {t.accusedDiscordIds.length === 0 && " Noch niemand zugeordnet – deshalb sieht es aktuell nur die Leitung."}
          </Notice>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <LiveMessages messages={t.messages} perspective="team" />
            {t.status !== "CLOSED" ? (
              <TicketComposer
                ticketId={t.id}
                status={t.status}
                priority={t.priority}
                tags={t.tags}
                sensitivity={t.sensitivity}
                accusedUserIds={accusedUserIds}
                claimedById={t.claimedById}
                meId={user.id}
                isMod={access.isMod}
                aiEnabled={settings["ai.enabled"] && isAiConfigured()}
                team={[]}
                templates={relevantTemplates.map((x) => ({ id: x.id, title: x.title, body: x.body }))}
                vars={{
                  name: name(t.creator),
                  discord_tag: `@${t.creator.username}`,
                  ticket_id: t.publicId,
                  kategorie: categoryLabel(t.category),
                  teammitglied: name(user),
                  status_link: `${publicEnv.appUrl}/tickets/${t.id}`,
                  hilfe_link: publicEnv.appUrl,
                  regelwerk_link: publicEnv.rulesUrl,
                  discord_link: publicEnv.discordInvite,
                }}
              />
            ) : (
              <Notice tone="info" title="Geschlossen">
                {t.closedReason} · {formatDayTime(t.closedAt)}
                {t.rating && (
                  <>
                    {" "}
                    · Bewertung: {"★".repeat(t.rating)}
                    {t.ratingComment ? ` „${t.ratingComment}“` : ""}
                  </>
                )}
                {t.transcript && (
                  <>
                    {" "}
                    ·{" "}
                    <Link href={`/tickets/${t.id}/transkript`} className="nv-link">
                      Transkript
                    </Link>
                  </>
                )}
              </Notice>
            )}
          </div>

          <aside className="space-y-4">
            <div className="nv-card p-4">
              <div className="flex items-center gap-3">
                <Avatar discordId={t.creator.discordId} avatar={t.creator.avatar} size={40} />
                <div className="min-w-0">
                  <Link href={`/team/spieler/${t.creator.id}`} className="font-semibold hover:text-red-text block truncate">
                    {name(t.creator)}
                  </Link>
                  <p className="text-xs text-muted truncate">
                    @{t.creator.username} · {otherTickets} weitere Tickets
                  </p>
                </div>
              </div>
              {t.creator.guildBanned && <p className="nv-pill nv-tone-danger mt-3">Vom Discord gebannt</p>}
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Erstellt</dt>
                  <dd>{formatRelative(t.createdAt)}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Erste Antwort</dt>
                  <dd>{t.firstResponseAt ? formatRelative(t.firstResponseAt) : "–"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Betreut</dt>
                  <dd>{t.claimedBy ? name(t.claimedBy) : "frei"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">DMs</dt>
                  <dd>{t.creator.dmOptOut ? "abgeschaltet" : "an"}</dd>
                </div>
              </dl>
            </div>
            <TicketSideControls
              ticketId={t.id}
              status={t.status}
              priority={t.priority}
              tags={t.tags}
              sensitivity={t.sensitivity}
              accusedUserIds={accusedUserIds}
              claimedById={t.claimedById}
              meId={user.id}
              isMod={access.isMod}
              aiEnabled={settings["ai.enabled"] && isAiConfigured()}
              team={members
                .filter((m) => m.id !== user.id)
                .map((m) => ({ id: m.id, name: m.globalName || m.username, canReceive: canReceiveTicket({ userId: m.id, discordId: m.discordId, teamLevel: m.teamLevel }, t) }))}
              templates={[]}
              vars={{}}
            />
            {fields.length > 0 && (
              <div className="nv-card p-4">
                <p className="nv-mono mb-2">Angaben</p>
                <dl className="space-y-2 text-sm">
                  {fields.map((f) => (
                    <div key={f.label}>
                      <dt className="text-muted">{f.label}</dt>
                      <dd className="break-words">
                        {/^https:\/\//.test(f.value) ? (
                          <a href={f.value} target="_blank" rel="noopener noreferrer nofollow" className="nv-link">
                            {f.value}
                          </a>
                        ) : (
                          f.value
                        )}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            <div className="nv-card p-4">
              <p className="nv-mono mb-2">Verlauf</p>
              <ol className="space-y-1.5 text-xs">
                {events.map((e) => (
                  <li key={e.id} className="text-muted">
                    <span className="text-fg-2">{e.actorName ?? "System"}</span> · {EVENT_LABEL[e.type] ?? e.type}
                    {e.to ? ` → ${e.type === "status" && e.to in TICKET_STATUS_LABEL_TEAM ? TICKET_STATUS_LABEL_TEAM[e.to as keyof typeof TICKET_STATUS_LABEL_TEAM] : e.type === "priority" && e.to in PRIORITY_LABEL ? PRIORITY_LABEL[e.to as keyof typeof PRIORITY_LABEL] : e.to}` : ""} · {formatRelative(e.createdAt)}
                  </li>
                ))}
              </ol>
              {t.transcript && (
                <Link href={`/tickets/${t.id}/transkript`} className="nv-btn nv-btn-ghost nv-btn-sm mt-3 w-full">
                  <FileText size={14} aria-hidden /> Transkript
                </Link>
              )}
            </div>
          </aside>
        </div>
      </div>
    </LiveThreadProvider>
  );
}
