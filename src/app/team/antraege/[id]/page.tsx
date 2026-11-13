import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Prohibit } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { publicEnv } from "@/lib/env";
import { requireTeam } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { isAiConfigured } from "@/lib/ai/config";
import { audit } from "@/lib/audit";
import { checkApproval, checkPropose, teamCanSeeRequest } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { displayAnswers, parseFields, parseOutcomes } from "@/lib/requests/model";
import { lookupBans } from "@/lib/requests/ban-provider";
import { listTeamMembers } from "@/lib/team/queries";
import { Avatar, Notice, RequestStatusBadge, formatDay, formatDayTime, formatRelative } from "@/components/ui";
import { LiveMessages, LiveThreadProvider } from "@/components/live/Live";
import { liveScopeQuery, liveVersion, type LiveScope } from "@/lib/live";
import { CommentBox, DecisionPanel, RequestComposer, RequestSideActions, VoteButtons } from "@/components/requests/RequestTeamPanel";
import { hasCertificate, verificationCode } from "@/lib/requests/certificate";
import { certificateUrl } from "@/lib/requests/certificate-db";

export const metadata: Metadata = { title: "Antrag" };

export default async function TeamRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, access } = await requireTeam();
  const viewer = viewerOf(user, access.teamLevel);
  // Version VOR den Daten lesen (prüft zugleich das Sichtrecht)
  const scope: LiveScope = { type: "request", id, perspective: "team" };
  const version = await liveVersion(scope, viewer);
  if (version === null) notFound();
  const r = await db.request.findUnique({
    where: { id },
    include: {
      type: true,
      applicant: true,
      sanction: true,
      messages: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { globalName: true, username: true } } } },
      votes: { include: { user: { select: { globalName: true, username: true } } } },
      decisions: { orderBy: { createdAt: "desc" }, include: { proposedBy: { select: { globalName: true, username: true } }, approvedBy: { select: { globalName: true, username: true } } } },
      attachments: { select: { id: true, kind: true, url: true, provider: true, fileName: true } },
    },
  });
  if (!r || !teamCanSeeRequest(viewer, r.type)) notFound();
  if (r.type.visibleFrom !== "SUPPORT") await audit("request.view", { actorId: user.id, targetType: "request", targetId: r.id });

  const [settings, members, templates, bans, history] = await Promise.all([
    getSettings(),
    listTeamMembers(),
    db.messageTemplate.findMany({ where: { scope: { in: ["request", "all"] } }, orderBy: { order: "asc" } }),
    access.isMod ? lookupBans(r.applicant.discordId) : Promise.resolve([]),
    db.request.findMany({ where: { applicantId: r.applicantId, NOT: { id: r.id } }, include: { type: { select: { title: true, visibleFrom: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const outcomes = parseOutcomes(r.type.outcomes);
  const label = (k: string) => outcomes.find((o) => o.key === k)?.label ?? k;
  const name = (u: { globalName: string | null; username: string }) => u.globalName || u.username;
  const answers = displayAnswers(parseFields(r.type.fields), r.answers);
  const pending = r.decisions.find((d) => d.status === "PENDING") ?? null;
  const propose = checkPropose(viewer, r.type, r);
  const approve = pending ? checkApproval(viewer, r.type, r, pending) : null;
  const issuer = r.issuedByDiscordId ? members.find((m) => m.discordId === r.issuedByDiscordId) : null;
  const myVote = r.votes.find((v) => v.userId === user.id)?.value ?? null;
  const cooldown = await db.cooldown.findFirst({ where: { userId: r.applicantId, typeId: r.typeId, until: { gt: new Date() } }, orderBy: { until: "desc" } });
  const relevantTemplates = templates.filter((x) => !x.requestTypeSlug || x.requestTypeSlug === r.type.slug);

  return (
    <LiveThreadProvider query={liveScopeQuery(scope)} version={version} viewerName={user.globalName || user.username}>
      <div>
        <Link href="/team/antraege" className="nv-btn nv-btn-quiet nv-btn-sm">
          <ArrowLeft size={14} aria-hidden /> Alle Anträge
        </Link>
        <div className="mt-4">
          <p className="nv-label">
            {r.publicId}{" // "}{r.type.title}
          </p>
          <h1 className="nv-headline text-3xl sm:text-4xl mt-3">{r.type.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RequestStatusBadge status={r.status} team outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
            {r.type.fourEyes && <span className="nv-pill nv-tone-info">Vier-Augen-Prinzip</span>}
            {r.honestyConfirmedAt && <span className="nv-pill nv-tone-muted">Ehrlichkeit bestätigt</span>}
          </div>
        </div>

        {r.decidedAt && r.outcomeLabel && (
          <Notice tone="success" title={`Entschieden: ${r.outcomeLabel}`} className="mt-4">
            {formatDayTime(r.decidedAt)} · {r.decisionReason}
            {hasCertificate(r) && (
              <span className="block mt-2">
                <a href={`${certificateUrl(r.id)}?ansehen=1`} target="_blank" rel="noopener" className="underline font-medium">
                  Bescheid (PDF) ansehen
                </a>
                {" · Prüfcode: "}
                <code className="font-mono">{verificationCode(r.id)}</code>
              </span>
            )}
          </Notice>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0 space-y-6">
            <section className="nv-card p-5" aria-labelledby="angaben">
              <h2 id="angaben" className="nv-mono mb-3">
                Angaben
              </h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                {answers.map((a) => (
                  <div key={a.key} className={a.value.length > 80 ? "sm:col-span-2" : ""}>
                    <dt className="text-xs text-muted">{a.label}</dt>
                    <dd className="text-sm whitespace-pre-line break-words mt-0.5">
                      {/^https:\/\//.test(a.value) ? (
                        <a href={a.value} target="_blank" rel="noopener noreferrer nofollow" className="nv-link">
                          {a.value}
                        </a>
                      ) : (
                        a.value
                      )}
                    </dd>
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
                          <img src={`/api/uploads/${a.id}`} alt={a.fileName ?? "Beleg"} className="h-20 w-20 object-cover rounded-lg border border-line" />
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
            </section>

            <section aria-labelledby="verlauf">
              <h2 id="verlauf" className="nv-mono mb-3">
                Verlauf mit dem Antragsteller
              </h2>
              <LiveMessages messages={r.messages.map((m) => ({ ...m, source: "WEB" as const, attachments: [] }))} perspective="team" />
            </section>
            {["SUBMITTED", "IN_REVIEW", "QUESTION"].includes(r.status) && (
              <RequestComposer
                requestId={r.id}
                templates={relevantTemplates.map((x) => ({ id: x.id, title: x.title, body: x.body }))}
                vars={{
                  name: name(r.applicant),
                  discord_tag: `@${r.applicant.username}`,
                  antrag_id: r.publicId,
                  antragsart: r.type.title,
                  teammitglied: name(user),
                  status_link: `${publicEnv.appUrl}/antraege/${r.id}`,
                  hilfe_link: publicEnv.appUrl,
                  regelwerk_link: publicEnv.rulesUrl,
                  discord_link: publicEnv.discordInvite,
                  sperrfrist: cooldown ? formatDay(cooldown.until) : undefined,
                }}
              />
            )}

            <DecisionPanel
              requestId={r.id}
              outcomes={outcomes.map((o) => ({ key: o.key, label: o.label }))}
              canPropose={propose.ok}
              proposeBlock={propose.ok ? null : propose.reason}
              fourEyes={r.type.fourEyes}
              meId={user.id}
              isLead={access.isLead}
              pending={
                pending
                  ? {
                      id: pending.id,
                      outcomeKey: pending.outcomeKey,
                      outcomeLabel: label(pending.outcomeKey),
                      reason: pending.reason,
                      proposedBy: name(pending.proposedBy),
                      proposedById: pending.proposedById,
                      canApprove: !!approve?.ok,
                      approveBlock: approve && !approve.ok ? approve.reason : null,
                    }
                  : null
              }
            />

            {r.decisions.filter((d) => d.status !== "PENDING").length > 0 && (
              <section className="nv-card p-5">
                <h2 className="nv-mono mb-3">Entscheidungsverlauf</h2>
                <ol className="space-y-2 text-sm">
                  {r.decisions
                    .filter((d) => d.status !== "PENDING")
                    .map((d) => (
                      <li key={d.id} className="text-muted">
                        {formatRelative(d.createdAt)}: <span className="text-fg-2">{name(d.proposedBy)}</span> schlug „{label(d.outcomeKey)}“ vor –{" "}
                        {d.status === "APPROVED" ? (d.approvedBy ? `bestätigt von ${name(d.approvedBy)}` : "gültig ohne zweite Person") : d.status === "SUPERSEDED" ? "ersetzt" : "zurückgezogen"}
                      </li>
                    ))}
                </ol>
              </section>
            )}
          </div>

          <aside className="space-y-4">
            <div className="nv-card p-4">
              <div className="flex items-center gap-3">
                <Avatar discordId={r.applicant.discordId} avatar={r.applicant.avatar} size={40} />
                <div className="min-w-0">
                  <Link href={`/team/spieler/${r.applicant.id}`} className="font-semibold hover:text-red-text block truncate">
                    {name(r.applicant)}
                  </Link>
                  <p className="text-xs text-muted font-mono truncate">{r.applicant.discordId}</p>
                </div>
              </div>
              {r.applicant.guildBanned && (
                <p className="mt-3 nv-pill nv-tone-danger">
                  <Prohibit size={12} aria-hidden /> Vom Discord gebannt{r.applicant.guildBanReason ? `: ${r.applicant.guildBanReason}` : ""}
                </p>
              )}
              {cooldown && <p className="mt-2 text-xs text-[color:var(--tone-warn)]">Sperrfrist für diese Antragsart bis {formatDay(cooldown.until)}</p>}
              {issuer && (
                <p className="mt-2 text-xs text-muted">
                  Strafe ausgesprochen von <strong className="text-fg-2">{issuer.globalName || issuer.username}</strong>
                </p>
              )}
            </div>

            <div className="nv-card p-4 space-y-3">
              <p className="nv-mono">Abstimmung</p>
              <VoteButtons requestId={r.id} mine={myVote} disabled={!["SUBMITTED", "IN_REVIEW", "QUESTION"].includes(r.status)} />
              {r.votes.length > 0 && (
                <ul className="text-xs text-muted space-y-1">
                  {r.votes.map((v) => (
                    <li key={v.id}>
                      {name(v.user)}: {v.value === "PRO" ? "Pro" : v.value === "CONTRA" ? "Contra" : "Enthaltung"}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="nv-card p-4 space-y-3">
              <p className="nv-mono">Interne Diskussion</p>
              <ul className="space-y-2">
                {r.comments.map((c) => (
                  <li key={c.id} className="text-sm">
                    <span className="font-medium">{name(c.author)}</span> <span className="text-xs text-muted">{formatRelative(c.createdAt)}</span>
                    <p className="text-fg-2 whitespace-pre-line">{c.body}</p>
                  </li>
                ))}
              </ul>
              <CommentBox requestId={r.id} />
            </div>

            <RequestSideActions
              requestId={r.id}
              status={r.status}
              isMod={access.isMod}
              issuerUserId={issuer?.id ?? null}
              team={members.map((m) => ({ id: m.id, name: m.globalName || m.username }))}
              aiEnabled={settings["ai.enabled"] && isAiConfigured()}
            />

            {access.isMod && (
              <div className="nv-card p-4">
                <p className="nv-mono mb-2">Bekannte Strafen</p>
                {r.sanction && <p className="text-xs text-muted mb-2">Verknüpft über Ban-ID {r.sanction.externalId}</p>}
                {bans.length === 0 ? (
                  <p className="text-sm text-muted">Keine eingetragenen Banns.</p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {bans.map((b, k) => (
                      <li key={k}>
                        <span className="nv-pill nv-tone-muted !text-[0.62rem] !py-0 mr-1">{b.source}</span>
                        {b.reason}
                        {b.externalId ? ` (${b.externalId})` : ""}
                        {b.issuedByName ? ` · von ${b.issuedByName}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {history.filter((h) => teamCanSeeRequest(viewer, h.type)).length > 0 && (
              <div className="nv-card p-4">
                <p className="nv-mono mb-2">Frühere Anträge</p>
                <ul className="space-y-1 text-sm">
                  {history
                    .filter((h) => teamCanSeeRequest(viewer, h.type))
                    .map((h) => (
                      <li key={h.id}>
                        <Link href={`/team/antraege/${h.id}`} className="hover:text-red-text">
                          {h.type.title}
                        </Link>{" "}
                        <span className="text-xs text-muted">· {h.outcomeLabel ?? h.status}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </div>
    </LiveThreadProvider>
  );
}
