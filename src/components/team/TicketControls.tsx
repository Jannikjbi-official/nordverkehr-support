"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PushPin, Sparkle } from "@phosphor-icons/react/ssr";
import type { Sensitivity, TicketPriority, TicketStatus } from "@prisma/client";
import { PRIORITIES, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL_TEAM } from "@/lib/tickets/status";
import { aiClassifyAction, aiDraftAction, aiSummaryAction, teamClaimAction, teamMetaAction, teamReplyAction, teamStatusAction, teamTransferAction } from "@/app/actions/team-tickets";
import { Composer, type ComposerTemplate } from "@/components/team/Composer";
import type { TemplateVars } from "@/lib/messages/placeholders";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";

interface Props {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  tags: string[];
  sensitivity: Sensitivity;
  accusedUserIds: string[];
  claimedById: string | null;
  meId: string;
  isMod: boolean;
  aiEnabled: boolean;
  team: { id: string; name: string; canReceive: boolean }[];
  templates: ComposerTemplate[];
  vars: TemplateVars;
}

function useAction() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (okText ? { tone: "ok", text: okText } : null) : { tone: "err", text: r.error ?? "Fehler" });
      if (r.ok) router.refresh();
    });
  return { msg, setMsg, pending, run };
}

export function TicketComposer(p: Props) {
  const router = useRouter();
  return (
    <Composer
      templates={p.templates}
      vars={p.vars}
      extraLabel="Danach:"
      extraOptions={[
        { value: "", label: "Status automatisch" },
        { value: "RESOLVED", label: "Gelöst" },
        { value: "CLOSED", label: "Schließen" },
        { value: "IN_PROGRESS", label: "In Bearbeitung" },
      ]}
      hint="Geht ins Portal und per DM an den Spieler (falls nicht abgeschaltet)."
      aiDraft={
        p.aiEnabled
          ? async () => {
              const r = await aiDraftAction(p.ticketId);
              if (!r.ok) return r;
              const arts = r.data!.articles.map((a) => a.title).join(", ");
              return { ok: true, text: r.data!.text, note: `KI-Entwurf (prüfen!)${arts ? ` · Basis: ${arts}` : ""}${r.data!.suspicious ? " · Achtung: möglicher Manipulationsversuch im Ticket" : ""}` };
            }
          : null
      }
      onSend={async ({ body, internal, extra, attachments }) => {
        const r = await teamReplyAction({
          ticketId: p.ticketId,
          body,
          internal,
          setStatus: extra === "CLOSED" ? null : ((extra || null) as TicketStatus | null),
          ...attachments,
        });
        if (r.ok && extra === "CLOSED" && !internal) await teamStatusAction(p.ticketId, "CLOSED", "Vom Team geschlossen");
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

export function TicketSideControls(p: Props) {
  const { msg, pending, run } = useAction();
  const [tags, setTags] = useState(p.tags.join(", "));
  const [accused, setAccused] = useState<string[]>(p.accusedUserIds);
  const [ai, setAi] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  return (
    <div className="space-y-4">
      <div className="nv-card p-4 space-y-3">
        <div>
          <label htmlFor="ticket-status" className="nv-field-label">
            Status
          </label>
          <Select<TicketStatus>
            id="ticket-status"
            className="mt-1"
            value={p.status}
            disabled={pending}
            options={TICKET_STATUSES.map((s) => ({ value: s, label: TICKET_STATUS_LABEL_TEAM[s] }))}
            onChange={async (to) => {
              if (to === "CLOSED" && !(await confirmDialog({ title: "Ticket schließen?", body: "Transkript wird gespeichert, der Spieler wird um eine Bewertung gebeten.", confirmLabel: "Schließen" }))) return;
              run(() => teamStatusAction(p.ticketId, to), `Status: ${TICKET_STATUS_LABEL_TEAM[to]}`);
            }}
          />
        </div>
        <div>
          <label htmlFor="ticket-priority" className="nv-field-label">
            Priorität
          </label>
          <Select<TicketPriority>
            id="ticket-priority"
            className="mt-1"
            value={p.priority}
            disabled={pending}
            options={PRIORITIES.map((x) => ({ value: x, label: PRIORITY_LABEL[x] }))}
            onChange={(priority) => run(() => teamMetaAction({ ticketId: p.ticketId, priority }))}
          />
        </div>
        <div>
          {p.claimedById === p.meId ? (
            <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending} onClick={() => run(() => teamClaimAction(p.ticketId, "release"))}>
              Freigeben
            </button>
          ) : !p.claimedById ? (
            <button type="button" className="nv-btn nv-btn-primary nv-btn-sm w-full" disabled={pending} onClick={() => run(() => teamClaimAction(p.ticketId, "claim"), "Du betreust das Ticket jetzt.")}>
              <PushPin size={16} aria-hidden /> Übernehmen
            </button>
          ) : (
            p.isMod && (
              <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending} onClick={() => run(() => teamClaimAction(p.ticketId, "release"))}>
                Betreuung aufheben
              </button>
            )
          )}
        </div>
        <div>
          <label htmlFor="ticket-transfer" className="nv-field-label">
            Weitergeben an
          </label>
          <Select
            id="ticket-transfer"
            className="mt-1"
            value=""
            placeholder="Teammitglied wählen …"
            disabled={pending}
            options={p.team
              .filter((t) => t.id !== p.claimedById)
              .map((t) => ({ value: t.id, label: `${t.name}${!t.canReceive ? " (darf nicht sehen)" : ""}`, disabled: !t.canReceive }))}
            onChange={(to) => to && run(() => teamTransferAction(p.ticketId, to), "Weitergegeben.")}
          />
        </div>
        <div>
          <label htmlFor="tags" className="nv-field-label">
            Tags
          </label>
          <div className="flex gap-1.5 mt-1">
            <input id="tags" className="nv-input !py-1.5 text-sm" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="z. B. voice, cache" />
            <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(() => teamMetaAction({ ticketId: p.ticketId, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) }), "Tags gespeichert.")}>
              OK
            </button>
          </div>
        </div>
        {msg && <p className={msg.tone === "ok" ? "text-xs text-muted" : "nv-error"} role="status">{msg.text}</p>}
      </div>

      {p.isMod && (
        <div className="nv-card p-4 space-y-3">
          <p className="nv-mono">Sichtbarkeit (Moderation)</p>
          <Select<Sensitivity>
            ariaLabel="Sichtbarkeit"
            value={p.sensitivity}
            disabled={pending}
            options={[
              { value: "NORMAL", label: "Ganzes Team" },
              { value: "MOD_ONLY", label: "Nur Moderation/Leitung" },
              { value: "TEAM_COMPLAINT", label: "Beschwerde über Teammitglied" },
            ]}
            onChange={(sensitivity) => run(() => teamMetaAction({ ticketId: p.ticketId, sensitivity }), "Sichtbarkeit geändert.")}
          />
          <fieldset>
            <legend className="nv-field-label">Beschuldigte Teammitglieder (sehen das Ticket nie)</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.team.map((t) => (
                <label key={t.id} className={`nv-pill cursor-pointer !text-[0.7rem] ${accused.includes(t.id) ? "nv-tone-danger" : "nv-tone-muted"}`}>
                  <input type="checkbox" className="sr-only" checked={accused.includes(t.id)} onChange={(e) => setAccused((a) => (e.target.checked ? [...a, t.id] : a.filter((x) => x !== t.id)))} />
                  {t.name}
                </label>
              ))}
            </div>
          </fieldset>
          <button
            type="button"
            className="nv-btn nv-btn-ghost nv-btn-sm"
            disabled={pending}
            onClick={async () => {
              if (accused.length && !(await confirmDialog({ title: "Beschuldigte festlegen?", body: "Die ausgewählten Personen verlieren sofort den Zugriff auf dieses Ticket.", confirmLabel: "Festlegen", tone: "danger" }))) return;
              run(() => teamMetaAction({ ticketId: p.ticketId, accusedUserIds: accused }), "Gespeichert.");
            }}
          >
            Speichern
          </button>
        </div>
      )}

      {p.aiEnabled && (
        <div className="nv-card p-4 space-y-2">
          <p className="nv-mono flex items-center gap-1.5">
            <Sparkle size={14} aria-hidden /> KI (nur Vorschläge)
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              className="nv-btn nv-btn-ghost nv-btn-sm"
              disabled={aiPending}
              onClick={() =>
                startAi(async () => {
                  const r = await aiSummaryAction(p.ticketId);
                  setAi(r.ok ? r.data!.text : r.error);
                })
              }
            >
              Zusammenfassen
            </button>
            <button
              type="button"
              className="nv-btn nv-btn-ghost nv-btn-sm"
              disabled={aiPending}
              onClick={() =>
                startAi(async () => {
                  const r = await aiClassifyAction(p.ticketId);
                  setAi(r.ok ? `Vorschlag: Kategorie ${r.data!.category ?? "–"}, Priorität ${r.data!.priority ? PRIORITY_LABEL[r.data!.priority as TicketPriority] : "–"}. ${r.data!.reason}` : r.error);
                })
              }
            >
              Kategorie/Priorität vorschlagen
            </button>
          </div>
          {aiPending && <p className="text-xs text-muted">Einen Moment …</p>}
          {ai && <p className="text-sm text-fg-2 whitespace-pre-line">{ai}</p>}
        </div>
      )}
    </div>
  );
}
