"use client";

import { useState, useTransition } from "react";
import { BellSlash, DownloadSimple, SignOut, Trash } from "@phosphor-icons/react/ssr";
import { deleteAccountAction, setDmOptOutAction, signOutEverywhereAction } from "@/app/actions/account";
import { signOutAction } from "@/app/actions/auth";

export function AccountControls({ dmOptOut }: { dmOptOut: boolean }) {
  const [optOut, setOptOut] = useState(dmOptOut);
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4 max-w-2xl">
      <section className="nv-card p-6">
        <h2 className="font-semibold flex items-center gap-2">
          <BellSlash size={20} aria-hidden /> DMs vom NV Lotse
        </h2>
        <p className="text-sm text-muted mt-1">Bei jeder Team-Antwort und Entscheidung schickt dir der Bot eine DM. Abgeschaltet steht alles nur noch hier im Portal.</p>
        <label className="mt-4 flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="nv-check"
            checked={!optOut}
            disabled={pending}
            onChange={(e) => {
              const next = !e.target.checked;
              setOptOut(next);
              start(async () => {
                const r = await setDmOptOutAction(next);
                setMsg(r.ok ? { tone: "ok", text: "Gespeichert." } : { tone: "err", text: r.error });
              });
            }}
          />
          <span className="text-sm">DMs bei Antworten bekommen</span>
        </label>
      </section>

      <section className="nv-card p-6">
        <h2 className="font-semibold flex items-center gap-2">
          <DownloadSimple size={20} aria-hidden /> Datenexport
        </h2>
        <p className="text-sm text-muted mt-1">Alle deine Tickets, Anträge und Angaben als JSON-Datei (Art. 15 und 20 DSGVO).</p>
        <a href="/api/me/export" className="nv-btn nv-btn-ghost nv-btn-sm mt-4">
          Daten herunterladen
        </a>
      </section>

      <section className="nv-card p-6">
        <h2 className="font-semibold flex items-center gap-2">
          <SignOut size={20} aria-hidden /> Sitzungen
        </h2>
        <p className="text-sm text-muted mt-1">Auf allen Geräten abmelden (z. B. wenn du an einem fremden PC eingeloggt warst).</p>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm mt-4"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await signOutEverywhereAction();
              await signOutAction();
            })
          }
        >
          Überall abmelden
        </button>
      </section>

      <section className="nv-card p-6 border-[color:var(--tone-danger)]">
        <h2 className="font-semibold flex items-center gap-2 text-[color:var(--tone-danger)]">
          <Trash size={20} aria-hidden /> Konto löschen
        </h2>
        <p className="text-sm text-muted mt-1">
          Löscht dein Konto mit allen Tickets, Nachrichten, Anträgen und Anhängen. Eingetragene Strafen (z. B. Banns) bleiben aus Sicherheitsgründen gespeichert. Das kann
          nicht rückgängig gemacht werden.
        </p>
        <label htmlFor="del-confirm" className="nv-field-label mt-4 block">
          Zur Bestätigung LÖSCHEN eintippen
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input id="del-confirm" className="nv-input max-w-[220px]" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          <button
            type="button"
            className="nv-btn nv-btn-danger-solid nv-btn-sm"
            disabled={pending || confirm.trim().toUpperCase() !== "LÖSCHEN"}
            onClick={() =>
              start(async () => {
                const r = await deleteAccountAction(confirm);
                if (!r.ok) return setMsg({ tone: "err", text: r.error });
                await signOutAction();
              })
            }
          >
            Endgültig löschen
          </button>
        </div>
      </section>
      {msg && (
        <p role="status" className={msg.tone === "ok" ? "text-sm text-muted" : "nv-error"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
