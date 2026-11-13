"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addNoteAction, addSanctionAction, liftSanctionAction } from "@/app/actions/team-players";

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "Fehler");
      after?.();
      router.refresh();
    });
  return { error, pending, run };
}

export function NoteForm({ subjectId }: { subjectId: string }) {
  const { error, pending, run } = useRun();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addNoteAction(subjectId, body), () => setBody(""));
      }}
    >
      <label htmlFor="note" className="sr-only">
        Notiz
      </label>
      <textarea id="note" className="nv-input min-h-20 text-sm" maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Interne Notiz (nur Team) …" />
      <button type="submit" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || body.trim().length < 2}>
        Notiz speichern
      </button>
      {error && <p className="nv-error">{error}</p>}
    </form>
  );
}

export function SanctionForm({ subjectId, team }: { subjectId: string; team: { id: string; name: string }[] }) {
  const { error, pending, run } = useRun();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "WARNING", reason: "", externalId: "", banType: "", endsAt: "", issuedByUserId: "" });
  if (!open)
    return (
      <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm mt-4" onClick={() => setOpen(true)}>
        Strafe eintragen
      </button>
    );
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            addSanctionAction({
              subjectId,
              kind: f.kind as "WARNING",
              reason: f.reason,
              externalId: f.externalId || undefined,
              banType: f.banType || undefined,
              endsAt: f.endsAt || undefined,
              issuedByUserId: f.issuedByUserId || undefined,
            }),
          () => setOpen(false),
        );
      }}
    >
      <label>
        <span className="nv-field-label">Art</span>
        <select className="nv-input mt-1" value={f.kind} onChange={set("kind")}>
          <option value="WARNING">Verwarnung</option>
          <option value="KICK">Kick</option>
          <option value="JAIL">Jail</option>
          <option value="FINE">Geldstrafe</option>
          <option value="BAN">Bann</option>
        </select>
      </label>
      <label>
        <span className="nv-field-label">Ausgesprochen von</span>
        <select className="nv-input mt-1" value={f.issuedByUserId} onChange={set("issuedByUserId")}>
          <option value="">mir</option>
          {team.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="nv-field-label">Grund</span>
        <textarea className="nv-input mt-1 min-h-16" value={f.reason} onChange={set("reason")} maxLength={1000} />
      </label>
      <label>
        <span className="nv-field-label">Ban-ID (optional)</span>
        <input className="nv-input mt-1" value={f.externalId} onChange={set("externalId")} maxLength={60} />
      </label>
      <label>
        <span className="nv-field-label">Bannart (für Sperrfristen)</span>
        <input className="nv-input mt-1" value={f.banType} onChange={set("banType")} maxLength={60} placeholder="z. B. Temporärer Bann" />
      </label>
      <label>
        <span className="nv-field-label">Bis (optional)</span>
        <input type="datetime-local" className="nv-input mt-1" value={f.endsAt} onChange={set("endsAt")} />
      </label>
      <div className="sm:col-span-2 flex gap-2">
        <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || f.reason.trim().length < 3}>
          Eintragen
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
      {error && <p className="nv-error sm:col-span-2">{error}</p>}
    </form>
  );
}

export function LiftSanctionButton({ sanctionId }: { sanctionId: string }) {
  const { error, pending, run } = useRun();
  return (
    <span>
      <button
        type="button"
        className="nv-btn nv-btn-quiet nv-btn-sm"
        disabled={pending}
        onClick={() => {
          const note = window.prompt("Kurze Notiz zur Aufhebung (optional):") ?? "";
          run(() => liftSanctionAction(sanctionId, note));
        }}
      >
        Aufheben
      </button>
      {error && <span className="nv-error block">{error}</span>}
    </span>
  );
}
