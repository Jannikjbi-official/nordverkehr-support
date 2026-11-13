import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { IncidentManager } from "@/components/team/IncidentManager";

export const metadata: Metadata = { title: "Statusseite pflegen" };

export default async function TeamStatusPage() {
  const { access } = await requireTeam();
  const incidents = await db.statusIncident.findMany({ orderBy: [{ resolvedAt: "asc" }, { startsAt: "desc" }], take: 50 });
  return (
    <div>
      <p className="nv-label">Team // Statusseite</p>
      <h1 className="nv-headline text-4xl mt-3">
        Probleme &amp; <em>Wartungen</em>
      </h1>
      <p className="text-muted mt-2">Was hier steht, sehen alle auf der öffentlichen Statusseite. Gameserver- und TeamSpeak-Status kommen automatisch.</p>
      <div className="mt-6">
        <IncidentManager
          canDelete={access.isMod}
          incidents={incidents.map((i) => ({
            id: i.id,
            title: i.title,
            body: i.body,
            kind: i.kind,
            severity: i.severity,
            systems: i.systems,
            startsAt: i.startsAt.toISOString(),
            endsAt: i.endsAt?.toISOString() ?? "",
            resolvedAt: i.resolvedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </div>
  );
}
