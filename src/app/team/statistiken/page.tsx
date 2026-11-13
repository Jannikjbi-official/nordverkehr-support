import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { requestTeamWhere, ticketTeamWhere } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { categoryLabel } from "@/lib/tickets/categories";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/status";
import { OUTCOME_CATEGORY_LABEL } from "@/lib/requests/model";
import { average, countBy, formatDuration, median, weakArticles } from "@/lib/team/stats";
import { formatUsd, monthStart } from "@/lib/ai/config";
import { Stat } from "@/components/ui";
import { DismissMissButton } from "@/components/team/DismissMissButton";

export const metadata: Metadata = { title: "Statistiken" };

const RANGES = [7, 30, 90, 365];
const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

function Bars({ rows, label }: { rows: { key: string; count: number }[]; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="text-sm text-muted">Keine Daten im Zeitraum.</p>;
  return (
    <table className="w-full text-sm" aria-label={label}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <th scope="row" className="text-left font-normal text-fg-2 py-1 pr-3 w-40 truncate">
              {r.key}
            </th>
            <td className="py-1 w-full">
              <div className="h-2.5 rounded-full bg-red" style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }} aria-hidden />
            </td>
            <td className="py-1 pl-3 tabular-nums text-right">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ zeitraum?: string }> }) {
  const { user, access } = await requireTeam();
  const viewer = viewerOf(user, access.teamLevel);
  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.zeitraum)) ? Number(sp.zeitraum) : 30;
  const since = daysAgo(days);
  const types = await db.requestType.findMany();
  const vis = ticketTeamWhere(viewer);

  const [tickets, requests, rated, active, teamMsgs, misses, articles, members, aiAgg] = await Promise.all([
    db.ticket.findMany({ where: { AND: [vis, { createdAt: { gte: since } }] }, select: { category: true, createdAt: true, firstResponseAt: true, closedAt: true, resolvedAt: true, source: true } }),
    db.request.findMany({ where: { AND: [requestTeamWhere(viewer, types), { createdAt: { gte: since } }] }, select: { typeId: true, outcomeCategory: true, createdAt: true, decidedAt: true } }),
    db.ticket.findMany({ where: { AND: [vis, { ratedAt: { gte: since } }] }, select: { rating: true } }),
    db.ticket.groupBy({ by: ["claimedById"], where: { AND: [vis, { status: { in: ACTIVE_TICKET_STATUSES } }] }, _count: { _all: true } }),
    db.ticketMessage.groupBy({ by: ["authorId"], where: { kind: "TEAM", createdAt: { gte: since }, ticket: vis }, _count: { _all: true } }),
    db.searchMiss.findMany({ orderBy: [{ count: "desc" }, { lastAt: "desc" }], take: 20 }),
    db.helpArticle.findMany({ where: { status: "PUBLISHED" }, select: { id: true, title: true, helpfulYes: true, helpfulNo: true, views: true } }),
    db.user.findMany({ where: { teamLevel: { not: "NONE" } }, select: { id: true, globalName: true, username: true } }),
    access.isLead ? db.aiUsage.aggregate({ _sum: { costMicroUsd: true, inputTokens: true, outputTokens: true }, _count: true, where: { createdAt: { gte: monthStart() } } }) : Promise.resolve(null),
  ]);

  const firstResp = tickets.filter((t) => t.firstResponseAt).map((t) => t.firstResponseAt!.getTime() - t.createdAt.getTime());
  const resolution = tickets.filter((t) => t.resolvedAt || t.closedAt).map((t) => (t.resolvedAt ?? t.closedAt)!.getTime() - t.createdAt.getTime());
  const ratings = rated.map((r) => r.rating ?? 0).filter(Boolean);
  const name = (id: string | null) => {
    if (!id) return "niemand (frei)";
    const m = members.find((x) => x.id === id);
    return m ? m.globalName || m.username : "ehemalig";
  };
  const typeTitle = (id: string) => types.find((t) => t.id === id)?.title ?? id;
  const workload = members
    .map((m) => ({ key: m.globalName || m.username, active: active.find((a) => a.claimedById === m.id)?._count._all ?? 0, replies: teamMsgs.find((x) => x.authorId === m.id)?._count._all ?? 0 }))
    .filter((w) => w.active || w.replies)
    .sort((a, b) => b.active - a.active);
  const weak = weakArticles(articles).slice(0, 10);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nv-label">Team // Statistiken</p>
          <h1 className="nv-headline text-4xl mt-3">
            Zahlen, <em>ehrlich.</em>
          </h1>
          <p className="text-sm text-muted mt-1">Nur Vorgänge, die du sehen darfst.</p>
        </div>
        <nav aria-label="Zeitraum" className="flex gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={`?zeitraum=${r}`} className={`nv-btn nv-btn-sm ${r === days ? "nv-btn-primary" : "nv-btn-ghost"}`} aria-current={r === days ? "page" : undefined}>
              {r} Tage
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tickets" value={tickets.length} hint={`${tickets.filter((t) => t.source === "DISCORD").length} davon per Discord`} />
        <Stat label="Erste Antwort (Median)" value={formatDuration(median(firstResp))} hint={`Ø ${formatDuration(average(firstResp))}`} />
        <Stat label="Lösungszeit (Median)" value={formatDuration(median(resolution))} hint={`Ø ${formatDuration(average(resolution))}`} />
        <Stat label="Zufriedenheit" value={ratings.length ? `${average(ratings)!.toFixed(1)} ★` : "–"} hint={`${ratings.length} Bewertungen`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="nv-card p-5">
          <h2 className="nv-mono mb-4">Tickets pro Kategorie</h2>
          <Bars label="Tickets pro Kategorie" rows={countBy(tickets, (t) => categoryLabel(t.category))} />
        </section>
        <section className="nv-card p-5">
          <h2 className="nv-mono mb-4">Anträge pro Art</h2>
          <Bars label="Anträge pro Art" rows={countBy(requests, (r) => typeTitle(r.typeId))} />
          <h3 className="nv-mono mt-6 mb-3">Ergebnisse</h3>
          <Bars label="Ergebnisse" rows={countBy(requests.filter((r) => r.outcomeCategory), (r) => OUTCOME_CATEGORY_LABEL[r.outcomeCategory!])} />
        </section>
      </div>

      <section className="nv-card p-5">
        <h2 className="nv-mono mb-4">Auslastung im Team</h2>
        {workload.length === 0 ? (
          <p className="text-sm text-muted">Keine Daten.</p>
        ) : (
          <table className="nv-table w-full">
            <thead>
              <tr>
                <th>Teammitglied</th>
                <th>Offene Tickets (betreut)</th>
                <th>Antworten im Zeitraum</th>
              </tr>
            </thead>
            <tbody>
              {workload.map((w) => (
                <tr key={w.key}>
                  <td>{w.key}</td>
                  <td className="tabular-nums">{w.active}</td>
                  <td className="tabular-nums">{w.replies}</td>
                </tr>
              ))}
              <tr>
                <td className="text-muted">{name(null)}</td>
                <td className="tabular-nums">{active.find((a) => a.claimedById === null)?._count._all ?? 0}</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="nv-card p-5">
          <h2 className="nv-mono mb-1">Suchen ohne Treffer</h2>
          <p className="text-xs text-muted mb-4">Kandidaten für neue Artikel. Anonym, nur der Begriff.</p>
          {misses.length === 0 ? (
            <p className="text-sm text-muted">Keine.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {misses.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className="flex-1">„{m.term}“</span>
                  <span className="tabular-nums text-muted">{m.count}×</span>
                  <Link href={`/team/artikel/neu`} className="nv-link text-xs">
                    Artikel
                  </Link>
                  <DismissMissButton id={m.id} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="nv-card p-5">
          <h2 className="nv-mono mb-1">Artikel mit vielen „Nein“</h2>
          <p className="text-xs text-muted mb-4">Mindestens 3 Stimmen, mehr Nein als Ja.</p>
          {weak.length === 0 ? (
            <p className="text-sm text-muted">Keine auffälligen Artikel.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {weak.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <Link href={`/team/artikel/${a.id}`} className="flex-1 hover:text-red-text">
                    {a.title}
                  </Link>
                  <span className="tabular-nums text-[color:var(--tone-danger)]">
                    {a.helpfulNo}× Nein / {a.helpfulYes}× Ja
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {aiAgg && (
        <section className="nv-card p-5">
          <h2 className="nv-mono mb-2">KI-Nutzung (dieser Monat)</h2>
          <p className="text-sm">
            {aiAgg._count} Anfragen · {(aiAgg._sum.inputTokens ?? 0) + (aiAgg._sum.outputTokens ?? 0)} Tokens · {formatUsd(aiAgg._sum.costMicroUsd ?? 0)}
          </p>
        </section>
      )}

      {access.isLead && (
        <p className="text-sm">
          <a href={`/api/team/export?art=tickets&zeitraum=${days}`} className="nv-link">
            Tickets als CSV
          </a>{" "}
          ·{" "}
          <a href={`/api/team/export?art=antraege&zeitraum=${days}`} className="nv-link">
            Anträge als CSV
          </a>
        </p>
      )}
    </div>
  );
}
