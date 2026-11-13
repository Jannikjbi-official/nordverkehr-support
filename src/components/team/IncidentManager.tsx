"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteIncidentAction, incidentUpdateAction, saveIncidentAction } from "@/app/actions/team-content";
import { confirmDialog } from "@/components/ConfirmDialog";

interface Incident {
  id?: string;
  title: string;
  body: string;
  kind: "PROBLEM" | "MAINTENANCE";
  severity: "INFO" | "MINOR" | "MAJOR";
  systems: string[];
  startsAt: string;
  endsAt: string;
  resolvedAt?: string | null;
}

const SYSTEMS = [
  { key: "gameserver", label: "Gameserver" },
  { key: "teamspeak", label: "TeamSpeak" },
  { key: "discord", label: "Discord" },
  { key: "website", label: "Website" },
];

/** ISO → Wert für <input type="datetime-local"> (lokale Zeit) */
const toLocal = (iso: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function IncidentForm({ initial, onDone }: { initial: Incident; onDone: () => void }) {
  const [f, setF] = useState({ ...initial, startsAt: toLocal(initial.startsAt), endsAt: toLocal(initial.endsAt) });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="nv-card p-5 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveIncidentAction({
            id: f.id,
            title: f.title,
            body: f.body,
            kind: f.kind,
            severity: f.severity,
            systems: f.systems as ("gameserver" | "teamspeak" | "discord" | "website")[],
            startsAt: new Date(f.startsAt).toISOString(),
            endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : undefined,
          });
          if (!r.ok) return setError(r.error);
          onDone();
        });
      }}
    >
      <label className="sm:col-span-2">
        <span className="nv-field-label">Titel</span>
        <input className="nv-input mt-1" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      </label>
      <label>
        <span className="nv-field-label">Art</span>
        <select className="nv-input mt-1" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Incident["kind"] })}>
          <option value="PROBLEM">Bekanntes Problem</option>
          <option value="MAINTENANCE">Wartung</option>
        </select>
      </label>
      <label>
        <span className="nv-field-label">Schwere</span>
        <select className="nv-input mt-1" value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value as Incident["severity"] })}>
          <option value="INFO">Info</option>
          <option value="MINOR">Eingeschränkt</option>
          <option value="MAJOR">Störung</option>
        </select>
      </label>
      <label>
        <span className="nv-field-label">Beginn</span>
        <input type="datetime-local" className="nv-input mt-1" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} required />
      </label>
      <label>
        <span className="nv-field-label">Ende (optional)</span>
        <input type="datetime-local" className="nv-input mt-1" value={f.endsAt} onChange={(e) => setF({ ...f, endsAt: e.target.value })} />
      </label>
      <fieldset className="sm:col-span-2">
        <legend className="nv-field-label">Betroffen</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {SYSTEMS.map((s) => (
            <label key={s.key} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="nv-check" checked={f.systems.includes(s.key)} onChange={(e) => setF({ ...f, systems: e.target.checked ? [...f.systems, s.key] : f.systems.filter((x) => x !== s.key) })} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="sm:col-span-2">
        <span className="nv-field-label">Beschreibung (Markdown)</span>
        <textarea className="nv-input mt-1 min-h-24" value={f.body} maxLength={5000} onChange={(e) => setF({ ...f, body: e.target.value })} required />
      </label>
      {error && <p className="nv-error sm:col-span-2">{error}</p>}
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
          Speichern
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}

export function IncidentManager({ incidents, canDelete }: { incidents: Incident[]; canDelete: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Incident | null>(null);
  const [update, setUpdate] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const done = () => {
    setEditing(null);
    router.refresh();
  };
  return (
    <div className="space-y-4">
      {editing ? (
        <IncidentForm initial={editing} onDone={done} />
      ) : (
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm"
          onClick={() => setEditing({ title: "", body: "", kind: "PROBLEM", severity: "MINOR", systems: ["gameserver"], startsAt: new Date().toISOString(), endsAt: "" })}
        >
          Neue Meldung
        </button>
      )}
      <ul className="grid gap-3">
        {incidents.map((i) => (
          <li key={i.id} className={`nv-card p-4 ${i.resolvedAt ? "opacity-70" : ""}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`nv-pill ${i.kind === "MAINTENANCE" ? "nv-tone-info" : i.severity === "MAJOR" ? "nv-tone-danger" : "nv-tone-warn"}`}>{i.kind === "MAINTENANCE" ? "Wartung" : "Problem"}</span>
              <span className="font-semibold">{i.title}</span>
              {i.resolvedAt && <span className="nv-pill nv-tone-success">behoben</span>}
              <span className="ml-auto flex gap-1">
                <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setEditing(i)}>
                  Bearbeiten
                </button>
                {canDelete && (
                  <button
                    type="button"
                    className="nv-btn nv-btn-quiet nv-btn-sm"
                    onClick={async () => {
                      if (await confirmDialog({ title: "Meldung löschen?", confirmLabel: "Löschen", tone: "danger" })) start(async () => void (await deleteIncidentAction(i.id!), router.refresh()));
                    }}
                  >
                    Löschen
                  </button>
                )}
              </span>
            </div>
            {!i.resolvedAt && (
              <div className="mt-3 flex flex-wrap gap-2">
                <label htmlFor={`upd-${i.id}`} className="sr-only">
                  Update
                </label>
                <input id={`upd-${i.id}`} className="nv-input !py-1.5 text-sm flex-1 min-w-[200px]" placeholder="Update für die Statusseite …" value={update[i.id!] ?? ""} onChange={(e) => setUpdate({ ...update, [i.id!]: e.target.value })} />
                <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !(update[i.id!] ?? "").trim()} onClick={() => start(async () => void (await incidentUpdateAction(i.id!, update[i.id!] ?? "", false), setUpdate({ ...update, [i.id!]: "" }), router.refresh()))}>
                  Update posten
                </button>
                <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => start(async () => void (await incidentUpdateAction(i.id!, update[i.id!] ?? "", true), router.refresh()))}>
                  Als behoben markieren
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
