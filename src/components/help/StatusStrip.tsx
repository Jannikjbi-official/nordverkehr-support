import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Warning } from "@phosphor-icons/react/ssr";
import { getIncidents, getLiveStatus, type ServiceStatus } from "@/lib/status/service";

export function StateDot({ s }: { s: ServiceStatus }) {
  const color = s.state === "online" ? "var(--tone-success)" : s.state === "offline" ? "var(--tone-danger)" : "var(--nv-faint)";
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.state === "online" ? "nv-pulse-dot" : ""}`} style={{ background: color }} aria-hidden />;
}

export const stateLabel = (s: ServiceStatus) => (s.state === "online" ? "Online" : s.state === "offline" ? "Offline" : "Unbekannt");

async function Strip() {
  const [live, incidents] = await Promise.all([getLiveStatus(), getIncidents()]);
  const problems = incidents.active.filter((i) => i.kind === "PROBLEM");
  const maintenance = [...incidents.active, ...incidents.upcoming].filter((i) => i.kind === "MAINTENANCE");
  return (
    <Link href="/status" className="nv-card nv-card-hover px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      <span className="nv-mono">Status</span>
      <span className="flex items-center gap-2">
        <StateDot s={live.gameserver} /> Gameserver: {stateLabel(live.gameserver)}
        {live.gameserver.state === "online" && live.gameserver.players !== undefined && (
          <span className="text-muted">
            ({live.gameserver.players}
            {live.gameserver.maxPlayers ? `/${live.gameserver.maxPlayers}` : ""} online)
          </span>
        )}
      </span>
      <span className="flex items-center gap-2">
        <StateDot s={live.teamspeak} /> TeamSpeak: {stateLabel(live.teamspeak)}
      </span>
      {problems.length > 0 && (
        <span className="flex items-center gap-1.5 text-[color:var(--tone-warn)]">
          <Warning size={16} aria-hidden /> {problems.length} bekannte{problems.length === 1 ? "s Problem" : " Probleme"}
        </span>
      )}
      {maintenance.length > 0 && <span className="text-muted">{maintenance.length} Wartung{maintenance.length === 1 ? "" : "en"} geplant</span>}
      <span className="ml-auto flex items-center gap-1 text-muted">
        Details <ArrowRight size={14} aria-hidden />
      </span>
    </Link>
  );
}

export function StatusStrip() {
  return (
    <Suspense fallback={<div className="nv-card h-[58px] nv-skeleton" aria-hidden />}>
      <Strip />
    </Suspense>
  );
}
