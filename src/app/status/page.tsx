import type { Metadata } from "next";
import { GameController, Headset, Wrench, Warning, CheckCircle } from "@phosphor-icons/react/ssr";
import type { StatusIncident } from "@prisma/client";
import { getIncidents, getLiveStatus, type ServiceStatus } from "@/lib/status/service";
import { Container, PageHero, formatDayTime, formatRelative } from "@/components/ui";
import { StateDot, stateLabel } from "@/components/help/StatusStrip";
import { Markdown } from "@/components/Markdown";

export const metadata: Metadata = { title: "Serverstatus", description: "Gameserver, TeamSpeak, bekannte Probleme und Wartungen." };

const SYSTEM_LABEL: Record<string, string> = { gameserver: "Gameserver", teamspeak: "TeamSpeak", discord: "Discord", website: "Website" };
const SEVERITY: Record<string, { label: string; tone: string }> = {
  INFO: { label: "Info", tone: "info" },
  MINOR: { label: "Eingeschränkt", tone: "warn" },
  MAJOR: { label: "Störung", tone: "danger" },
};

function ServiceCard({ title, icon, s, hint }: { title: string; icon: React.ReactNode; s: ServiceStatus; hint?: string }) {
  return (
    <div className="nv-card p-6">
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 rounded-xl grid place-items-center bg-red-soft text-red-text border border-red-line">{icon}</div>
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="flex items-center gap-2 text-sm">
            <StateDot s={s} /> {stateLabel(s)}
          </p>
        </div>
      </div>
      {s.state === "online" && s.players !== undefined && (
        <p className="mt-5 font-display text-4xl">
          {s.players}
          {s.maxPlayers ? <span className="text-muted text-2xl">/{s.maxPlayers}</span> : null}
          <span className="block text-sm font-sans text-muted mt-1">{title === "TeamSpeak" ? "Leute im TeamSpeak" : "Spieler online"}</span>
        </p>
      )}
      {s.state === "unknown" && <p className="mt-4 text-sm text-muted">{hint ?? "Der Status wird gerade nicht abgefragt."}</p>}
      {s.state === "offline" && <p className="mt-4 text-sm text-muted">Nicht erreichbar. Schau unten, ob eine Wartung oder ein bekanntes Problem eingetragen ist.</p>}
      <p className="nv-mono mt-4">Geprüft {formatRelative(s.checkedAt)}</p>
    </div>
  );
}

function IncidentItem({ i }: { i: StatusIncident }) {
  const sev = SEVERITY[i.severity];
  const updates = (Array.isArray(i.updates) ? i.updates : []) as { at: string; text: string }[];
  return (
    <li className="nv-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`nv-pill nv-tone-${i.kind === "MAINTENANCE" ? "info" : sev.tone}`}>{i.kind === "MAINTENANCE" ? "Wartung" : sev.label}</span>
        {i.systems.map((s) => (
          <span key={s} className="nv-pill nv-tone-muted">
            {SYSTEM_LABEL[s] ?? s}
          </span>
        ))}
      </div>
      <h3 className="font-semibold text-lg mt-3">{i.title}</h3>
      <p className="text-sm text-muted mt-1">
        {formatDayTime(i.startsAt)}
        {i.endsAt ? ` – ${formatDayTime(i.endsAt)}` : ""}
        {i.resolvedAt ? ` · behoben ${formatDayTime(i.resolvedAt)}` : ""}
      </p>
      <Markdown source={i.body} className="mt-3 text-sm" />
      {updates.length > 0 && (
        <ol className="mt-4 space-y-2 border-l border-line pl-4">
          {[...updates].reverse().map((u, k) => (
            <li key={k} className="text-sm">
              <span className="nv-mono">{formatDayTime(u.at)}</span>
              <p className="text-fg-2">{u.text}</p>
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

export default async function StatusPage() {
  const [live, incidents] = await Promise.all([getLiveStatus(), getIncidents()]);
  const allGood = incidents.active.length === 0 && live.gameserver.state !== "offline" && live.teamspeak.state !== "offline";
  return (
    <>
      <PageHero label="Status // Live" title="Läuft alles" emphasis={allGood ? "rund?" : "rund? Nicht ganz."} compact>
        Live-Status vom Gameserver und TeamSpeak (kurz gecacht), dazu bekannte Probleme und geplante Wartungen – gepflegt vom Team.
      </PageHero>
      <Container>
        <div className="grid gap-4 md:grid-cols-2">
          <ServiceCard title="Gameserver" icon={<GameController size={22} aria-hidden />} s={live.gameserver} hint="Der Start ist in Vorbereitung – sobald der Server läuft, siehst du hier, wie viele online sind." />
          <ServiceCard title="TeamSpeak" icon={<Headset size={22} aria-hidden />} s={live.teamspeak} />
        </div>

        <section className="mt-12" aria-labelledby="probleme">
          <h2 id="probleme" className="nv-headline text-3xl">
            Bekannte <em>Probleme</em>
          </h2>
          {incidents.active.length === 0 ? (
            <p className="mt-4 flex items-center gap-2 text-muted">
              <CheckCircle size={20} className="text-[color:var(--tone-success)]" aria-hidden /> Gerade nichts bekannt. Du hast trotzdem Probleme? Mach ein Ticket auf.
            </p>
          ) : (
            <ul className="mt-6 grid gap-3">
              {incidents.active.map((i) => (
                <IncidentItem key={i.id} i={i} />
              ))}
            </ul>
          )}
        </section>

        <section className="mt-12" aria-labelledby="wartungen">
          <h2 id="wartungen" className="nv-headline text-3xl flex items-center gap-3">
            <Wrench size={26} className="text-red-text" aria-hidden /> Geplante <em>Wartungen</em>
          </h2>
          {incidents.upcoming.length === 0 ? (
            <p className="mt-4 text-muted">Keine Wartung geplant.</p>
          ) : (
            <ul className="mt-6 grid gap-3">
              {incidents.upcoming.map((i) => (
                <IncidentItem key={i.id} i={i} />
              ))}
            </ul>
          )}
        </section>

        {incidents.recent.length > 0 && (
          <section className="mt-12" aria-labelledby="verlauf">
            <h2 id="verlauf" className="nv-headline text-3xl flex items-center gap-3">
              <Warning size={26} className="text-red-text" aria-hidden /> Letzte <em>14 Tage</em>
            </h2>
            <ul className="mt-6 grid gap-3">
              {incidents.recent.map((i) => (
                <IncidentItem key={i.id} i={i} />
              ))}
            </ul>
          </section>
        )}
      </Container>
    </>
  );
}
