import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { requireLead } from "@/lib/auth/session";
import { AUDIT_LABELS } from "@/lib/audit";
import { formatDayTime } from "@/components/ui";

export const metadata: Metadata = { title: "Audit-Log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ aktion?: string; seite?: string }> }) {
  await requireLead();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.seite) || 0);
  const action = sp.aktion && sp.aktion in AUDIT_LABELS ? sp.aktion : undefined;
  const rows = await db.auditLog.findMany({ where: action ? { action } : {}, orderBy: { createdAt: "desc" }, skip: page * 100, take: 101 });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const actors = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, globalName: true, username: true } });
  const actorName = (id: string | null) => {
    const a = actors.find((x) => x.id === id);
    return a ? a.globalName || a.username : id ? "gelöscht" : "System";
  };
  const href = (t: string | null, id: string | null) => (t === "ticket" ? `/team/tickets/${id}` : t === "request" ? `/team/antraege/${id}` : t === "user" ? `/team/spieler/${id}` : t === "article" ? `/team/artikel/${id}` : null);

  return (
    <div>
      <p className="nv-label">Leitung // Audit-Log</p>
      <h1 className="nv-headline text-4xl mt-3">
        Wer hat was <em>gemacht?</em>
      </h1>
      <form method="get" className="mt-6 flex gap-2 items-end">
        <label>
          <span className="nv-field-label">Aktion</span>
          <select name="aktion" defaultValue={action ?? ""} className="nv-input mt-1">
            <option value="">Alle</option>
            {Object.entries(AUDIT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm">
          Filtern
        </button>
      </form>
      <div className="nv-card nv-scroll-x mt-6">
        <table className="nv-table w-full min-w-[640px]">
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Wer</th>
              <th>Aktion</th>
              <th>Ziel</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r) => {
              const h = href(r.targetType, r.targetId);
              return (
                <tr key={r.id}>
                  <td className="text-sm text-muted whitespace-nowrap">{formatDayTime(r.createdAt)}</td>
                  <td className="text-sm">{actorName(r.actorId)}</td>
                  <td className="text-sm">{AUDIT_LABELS[r.action as keyof typeof AUDIT_LABELS] ?? r.action}</td>
                  <td className="text-sm">
                    {h ? (
                      <Link href={h} className="nv-link">
                        {r.targetType}
                      </Link>
                    ) : (
                      r.targetType ?? ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        {page > 0 && (
          <Link href={`?${new URLSearchParams({ ...(action ? { aktion: action } : {}), seite: String(page - 1) })}`} className="nv-btn nv-btn-ghost nv-btn-sm">
            Neuer
          </Link>
        )}
        {rows.length > 100 && (
          <Link href={`?${new URLSearchParams({ ...(action ? { aktion: action } : {}), seite: String(page + 1) })}`} className="nv-btn nv-btn-ghost nv-btn-sm">
            Älter
          </Link>
        )}
      </div>
    </div>
  );
}
