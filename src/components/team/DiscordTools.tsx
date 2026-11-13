"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { postPanelAction, registerCommandsAction, runHousekeepingAction, setInteractionsUrlAction } from "@/app/actions/admin";
import { confirmDialog } from "@/components/ConfirmDialog";

export function DiscordTools() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: r.message ?? "Erledigt." } : { tone: "err", text: r.error ?? "Fehler" });
      router.refresh();
    });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(registerCommandsAction)}>
          Befehle registrieren
        </button>
        <button
          type="button"
          className="nv-btn nv-btn-ghost nv-btn-sm"
          disabled={pending}
          onClick={async () => {
            if (
              !(await confirmDialog({
                title: "Interactions-URL auf das Support-Center setzen?",
                body: "Danach laufen ALLE Knöpfe des Bots über das Support-Center, das fremde Interaktionen an das Bewerbungsportal weiterreicht. Im Bewerbungsportal den Knopf „Knopf ‚Übernehmen‘ einrichten“ danach nicht mehr drücken (siehe README).",
                confirmLabel: "Setzen",
              }))
            )
              return;
            run(setInteractionsUrlAction);
          }}
        >
          Interactions-URL setzen
        </button>
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(postPanelAction)}>
          Panel posten
        </button>
        <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" disabled={pending} onClick={() => run(runHousekeepingAction)}>
          Hintergrundarbeiten jetzt ausführen
        </button>
      </div>
      {msg && (
        <p className={msg.tone === "ok" ? "text-sm text-muted" : "nv-error"} role="status">
          {msg.text}
        </p>
      )}
    </div>
  );
}
