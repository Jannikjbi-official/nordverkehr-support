"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowsClockwise, PushPin, Sparkle } from "@phosphor-icons/react/ssr";
import type { Sensitivity, TicketPriority, TicketStatus } from "@prisma/client";
import { PRIORITIES, PRIORITY_LABEL, TICKET_STATUSES, TICKET_STATUS_LABEL_TEAM } from "@/lib/tickets/status";
import { aiClassifyAction, aiDraftAction, aiSummaryAction, teamClaimAction, teamMetaAction, teamReplyAction, teamStatusAction, teamSyncAction, teamTransferAction } from "@/app/actions/team-tickets";
import { Composer, type ComposerTemplate } from "@/components/team/Composer";
import type { TemplateVars } from "@/lib/messages/placeholders";
import { confirmDialog } from "@/components/ConfirmDialog";

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
  hasThread: boolean;
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
      hint={p.hasThread ? "Geht ins Portal, in den Discord-Thread und per DM an den Spieler (falls nicht abgeschaltet)." : "Geht ins Portal und per DM an den Spieler (falls nicht abgeschaltet)."}
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
  const { msg, setMsg, pending, run } = useAction();
  const [tags, setTags] = useState(p.tags.join(", "));
  const [accused, setAccused] = useState<string[]>(p.accusedUserIds);
  const [ai, setAi] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  return (
    <div className="space-y-4">
      <div className="nv-card p-4 space-y-3">
        <label className="block">
          <span className="nv-field-label">Status</span>
          <select
            className="nv-input mt-1"
            value={p.status}
            disabled={pending}
            onChange={async (e) => {
              const to = e.target.value as TicketStatus;
              if (to === "CLOSED" && !(await confirmDialog({ title: "Ticket schließen?", body: "Transkript wird gespeichert, der Spieler wird um eine Bewertung gebeten.", confirmLabel: "Schließen" }))) return;
              run(() => teamStatusAction(p.ticketId, to), `Status: ${TICKET_STATUS_LABEL_TEAM[to]}`);
            }}
          >
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABEL_TEAM[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="nv-field-label">Priorität</span>
          <select className="nv-input mt-1" value={p.priority} disabled={pending} onChange={(e) => run(() => teamMetaAction({ ticketId: p.ticketId, priority: e.target.value as TicketPriority }))}>
            {PRIORITIES.map((x) => (
              <option key={x} value={x}>
                {PRIORITY_LABEL[x]}
              </option>
            ))}
          </select>
        </label>
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
        <label className="block">
          <span className="nv-field-label">Weitergeben an</span>
          <select className="nv-input mt-1" value="" disabled={pending} onChange={(e) => e.target.value && run(() => teamTransferAction(p.ticketId, e.target.value), "Weitergegeben.")}>
            <option value="">Teammitglied wählen …</option>
            {p.team
              .filter((t) => t.id !== p.claimedById)
              .map((t) => (
                <option key={t.id} value={t.id} disabled={!t.canReceive}>
                  {t.name}
                  {!t.canReceive ? " (darf nicht sehen)" : ""}
                </option>
              ))}
          </select>
        </label>
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
        {p.hasThread && (
          <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm w-full" disabled={pending} onClick={() => run(async () => {
            const r = await teamSyncAction(p.ticketId);
            if (r.ok) setMsg({ tone: "ok", text: `${r.data?.imported ?? 0} neue Nachricht(en) aus Discord.` });
            return r;
          })}>
            <ArrowsClockwise size={16} aria-hidden /> Discord-Thread abgleichen
          </button>
        )}
        {msg && <p className={msg.tone === "ok" ? "text-xs text-muted" : "nv-error"} role="status">{msg.text}</p>}
      </div>

      {p.isMod && (
        <div className="nv-card p-4 space-y-3">
          <p className="nv-mono">Sichtbarkeit (Moderation)</p>
          <select className="nv-input text-sm" value={p.sensitivity} disabled={pending} onChange={(e) => run(() => teamMetaAction({ ticketId: p.ticketId, sensitivity: e.target.value as Sensitivity }), "Sichtbarkeit geändert.")}>
            <option value="NORMAL">Ganzes Team</option>
            <option value="MOD_ONLY">Nur Moderation/Leitung</option>
            <option value="TEAM_COMPLAINT">Beschwerde über Teammitglied</option>
          </select>
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
              if (accused.length && !(await confirmDialog({ title: "Beschuldigte festlegen?", body: "Die ausgewählten Personen verlieren sofort den Zugriff auf dieses Ticket (auch in Discord, der Thread wird geschlossen).", confirmLabel: "Festlegen", tone: "danger" }))) return;
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
