import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma, RequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { requestTeamWhere, teamCanSeeRequest } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { REQUEST_STATUS_LABEL_TEAM } from "@/lib/requests/model";
import { EmptyState, RequestStatusBadge, formatRelative } from "@/components/ui";
import { FormSelect } from "@/components/FormSelect";

export const metadata: Metadata = { title: "Anträge" };

const STATUSES: RequestStatus[] = ["SUBMITTED", "IN_REVIEW", "QUESTION", "DECIDED", "ARCHIVED"];

export default async function TeamRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { user, access } = await requireTeam();
  const viewer = viewerOf(user, access.teamLevel);
  const sp = await searchParams;
  const allTypes = await db.requestType.findMany({ orderBy: { order: "asc" } });
  const types = allTypes.filter((t) => teamCanSeeRequest(viewer, t));
  const typeFilter = types.find((t) => t.slug === sp.art);
  const status = STATUSES.includes(sp.status as RequestStatus) ? (sp.status as RequestStatus) : sp.status === "alle" ? null : "offen";

  const and: Prisma.RequestWhereInput[] = [requestTeamWhere(viewer, allTypes)];
  if (typeFilter) and.push({ typeId: typeFilter.id });
  if (status === "offen") and.push({ status: { in: ["SUBMITTED", "IN_REVIEW", "QUESTION"] } });
  else if (status) and.push({ status });
  if (sp.q) and.push({ OR: [{ publicId: { contains: sp.q.toUpperCase() } }, { applicant: { OR: [{ username: { contains: sp.q, mode: "insensitive" } }, { globalName: { contains: sp.q, mode: "insensitive" } }] } }] });

  const requests = await db.request.findMany({
    where: { AND: and },
    orderBy: { createdAt: status === "offen" ? "asc" : "desc" },
    take: 200,
    include: { type: true, applicant: { select: { id: true, username: true, globalName: true } }, votes: { select: { value: true } }, decisions: { where: { status: "PENDING" }, select: { id: true } } },
  });

  return (
    <div>
      <p className="nv-label">Team // Anträge</p>
      <h1 className="nv-headline text-4xl mt-3">
        Anträge <em>({requests.length})</em>
      </h1>
      <nav aria-label="Antragsarten" className="mt-6 flex flex-wrap gap-1.5">
        <Link href={`?status=${sp.status ?? ""}`} className={`nv-pill ${!typeFilter ? "nv-tone-accent" : "nv-tone-muted"}`}>
          Alle Arten
        </Link>
        {types.map((t) => (
          <Link key={t.id} href={`?art=${t.slug}&status=${sp.status ?? ""}`} className={`nv-pill ${typeFilter?.id === t.id ? "nv-tone-accent" : "nv-tone-muted"}`}>
            {t.title}
          </Link>
        ))}
      </nav>
      <form className="mt-4 flex flex-wrap gap-2 items-end" method="get">
        {typeFilter && <input type="hidden" name="art" value={typeFilter.slug} />}
        <div>
          <label htmlFor="antraege-status" className="nv-field-label">
            Status
          </label>
          <FormSelect
            id="antraege-status"
            name="status"
            defaultValue={status ?? "alle"}
            className="mt-1 w-56"
            options={[{ value: "offen", label: "Offen" }, { value: "alle", label: "Alle" }, ...STATUSES.map((s) => ({ value: s, label: REQUEST_STATUS_LABEL_TEAM[s] }))]}
          />
        </div>
        <label>
          <span className="nv-field-label">Suche</span>
          <input name="q" defaultValue={sp.q ?? ""} className="nv-input mt-1" placeholder="ID oder Name" />
        </label>
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm">
          Filtern
        </button>
      </form>
      <div className="mt-6">
        {requests.length === 0 ? (
          <EmptyState title="Keine Anträge">Nichts in dieser Ansicht.</EmptyState>
        ) : (
          <div className="nv-card nv-scroll-x">
            <table className="nv-table w-full min-w-[720px]">
              <thead>
                <tr>
                  <th>Antrag</th>
                  <th>Antragsteller</th>
                  <th>Status</th>
                  <th>Stimmen</th>
                  <th>Eingereicht</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const pro = r.votes.filter((v) => v.value === "PRO").length;
                  const contra = r.votes.filter((v) => v.value === "CONTRA").length;
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/team/antraege/${r.id}`} className="font-medium hover:text-red-text">
                          {r.type.title}
                        </Link>
                        <div className="text-xs text-muted">
                          <span className="font-mono">{r.publicId}</span>
                          {r.decisions.length > 0 && <span className="nv-pill nv-tone-warn !text-[0.62rem] !py-0 ml-2">Vorschlag wartet</span>}
                        </div>
                      </td>
                      <td>
                        <Link href={`/team/spieler/${r.applicant.id}`} className="hover:text-red-text">
                          {r.applicant.globalName || r.applicant.username}
                        </Link>
                      </td>
                      <td>
                        <RequestStatusBadge status={r.status} team outcome={r.outcomeCategory} outcomeLabel={r.outcomeLabel} />
                      </td>
                      <td className="tabular-nums text-sm">
                        <span className="text-[var(--tone-success)]">+{pro}</span> <span className="text-[var(--tone-danger)]">−{contra}</span>
                      </td>
                      <td className="text-sm text-muted">{formatRelative(r.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
