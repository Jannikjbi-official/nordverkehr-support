import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireLead } from "@/lib/auth/session";
import { LEVEL_LABEL } from "@/lib/auth/access";
import { NvIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Antragsarten" };

export default async function RequestTypesPage() {
  await requireLead();
  const types = await db.requestType.findMany({ orderBy: { order: "asc" }, include: { _count: { select: { requests: true } } } });
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="nv-label">Leitung // Antragsarten</p>
          <h1 className="nv-headline text-4xl mt-3">
            Antrags<em>arten</em>
          </h1>
          <p className="text-muted mt-2">Felder, Pflichtangaben, wer sehen und entscheiden darf, Vier-Augen-Prinzip, Sperrfristen.</p>
        </div>
        <Link href="/team/admin/antragsarten/neu" className="nv-btn nv-btn-primary nv-btn-sm">
          <Plus size={16} aria-hidden /> Neue Antragsart
        </Link>
      </div>
      <ul className="mt-6 grid gap-3">
        {types.map((t) => (
          <li key={t.id}>
            <Link href={`/team/admin/antragsarten/${t.id}`} className="nv-card nv-card-hover p-4 flex flex-wrap items-center gap-3">
              <NvIcon name={t.icon} className="text-red-text" />
              <span className="flex-1 min-w-[200px]">
                <span className="font-semibold block">{t.title}</span>
                <span className="text-xs text-muted">
                  sichtbar ab {LEVEL_LABEL[t.visibleFrom]} · entscheidet ab {LEVEL_LABEL[t.decideFrom]}
                  {t.fourEyes ? " · Vier-Augen" : ""}
                  {t.allowedWhenBanned ? " · auch für Gebannte" : ""} · {t._count.requests} Anträge
                </span>
              </span>
              {t.active ? <span className="nv-pill nv-tone-success">aktiv</span> : <span className="nv-pill nv-tone-muted">aus</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
