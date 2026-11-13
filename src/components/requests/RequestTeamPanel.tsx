"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle, Scales, Sparkle, ThumbsDown, ThumbsUp, MinusCircle } from "@phosphor-icons/react/ssr";
import {
  aiRequestSummaryAction,
  approveDecisionAction,
  proposeDecisionAction,
  requestCommentAction,
  requestIssuerAction,
  requestMessageAction,
  requestStatusAction,
  requestVoteAction,
  withdrawProposalAction,
} from "@/app/actions/team-requests";
import { Composer, type ComposerTemplate } from "@/components/team/Composer";
import type { TemplateVars } from "@/lib/messages/placeholders";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";

export function RequestComposer({ requestId, templates, vars }: { requestId: string; templates: ComposerTemplate[]; vars: TemplateVars }) {
  const router = useRouter();
  return (
    <Composer
      templates={templates}
      vars={vars}
      allowInternal={false}
      extraLabel="Art:"
      extraOptions={[
        { value: "question", label: "Rückfrage (Status → Rückfrage)" },
        { value: "message", label: "Nachricht" },
      ]}
      hint="Geht ins Portal und – falls möglich – per DM an den Spieler. Gebannte Spieler erreicht die DM meist nicht."
      placeholder="Rückfrage oder Nachricht an den Antragsteller …"
      onSend={async ({ body, extra }) => {
        const r = await requestMessageAction(requestId, body, extra === "question");
        if (r.ok) router.refresh();
        return r;
      }}
    />
  );
}

function useRun() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? (r.message ? { tone: "ok", text: r.message } : null) : { tone: "err", text: r.error ?? "Fehler" });
      if (r.ok) router.refresh();
    });
  return { msg, pending, run };
}

export function CommentBox({ requestId }: { requestId: string }) {
  const { msg, pending, run } = useRun();
  const [body, setBody] = useState("");
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const r = await requestCommentAction(requestId, body);
          if (r.ok) setBody("");
          return r;
        });
      }}
    >
      <label htmlFor="comment" className="sr-only">
        Interner Kommentar
      </label>
      <textarea id="comment" className="nv-input min-h-20 text-sm" maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Interner Kommentar (nur Team) …" />
      <button type="submit" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || body.trim().length < 2}>
        Kommentieren
      </button>
      {msg && <p className={msg.tone === "ok" ? "text-xs text-muted" : "nv-error"}>{msg.text}</p>}
    </form>
  );
}

export function VoteButtons({ requestId, mine, disabled }: { requestId: string; mine: "PRO" | "CONTRA" | "ABSTAIN" | null; disabled: boolean }) {
  const { msg, pending, run } = useRun();
  const btn = (v: "PRO" | "CONTRA" | "ABSTAIN", label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      aria-pressed={mine === v}
      disabled={pending || disabled}
      onClick={() => run(() => requestVoteAction(requestId, mine === v ? null : v))}
      className={`nv-btn nv-btn-sm ${mine === v ? "nv-btn-primary" : "nv-btn-ghost"}`}
    >
      <Icon size={15} aria-hidden /> {label}
    </button>
  );
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {btn("PRO", "Pro", ThumbsUp)}
        {btn("CONTRA", "Contra", ThumbsDown)}
        {btn("ABSTAIN", "Enthaltung", MinusCircle)}
      </div>
      {msg && <p className="nv-error mt-1">{msg.text}</p>}
    </div>
  );
}

export interface DecisionView {
  id: string;
  outcomeKey: string;
  outcomeLabel: string;
  reason: string;
  proposedBy: string;
  proposedById: string;
  canApprove: boolean;
  approveBlock: string | null;
}

export function DecisionPanel({
  requestId,
  outcomes,
  canPropose,
  proposeBlock,
  fourEyes,
  pending: pendingDecision,
  meId,
  isLead,
}: {
  requestId: string;
  outcomes: { key: string; label: string }[];
  canPropose: boolean;
  proposeBlock: string | null;
  fourEyes: boolean;
  pending: DecisionView | null;
  meId: string;
  isLead: boolean;
}) {
  const { msg, pending, run } = useRun();
  const [outcome, setOutcome] = useState(outcomes[0]?.key ?? "");
  const [reason, setReason] = useState("");

  return (
    <section id="entscheidung" className="nv-card p-5 space-y-4" aria-labelledby="decision-title">
      <h2 id="decision-title" className="font-semibold flex items-center gap-2">
        <Scales size={20} className="text-red-text" aria-hidden /> Entscheidung
      </h2>
      <p className="text-xs text-muted">
        {fourEyes
          ? "Vier-Augen-Prinzip: Eine Person schlägt vor, eine zweite (Moderation/Leitung) stimmt zu. Wer die Strafe ausgesprochen hat, zählt nie als zweite Person."
          : "Wer die Strafe ausgesprochen hat, braucht trotzdem eine zweite Person. Sonst gilt der Vorschlag sofort."}{" "}
        Die Begründung sieht der Spieler.
      </p>

      {pendingDecision && (
        <div className="rounded-xl border border-[color:var(--tone-warn)] bg-[color:var(--tone-warn-bg)] p-4 space-y-2">
          <p className="text-sm">
            <strong>Vorschlag von {pendingDecision.proposedBy}:</strong> {pendingDecision.outcomeLabel}
          </p>
          <p className="text-sm whitespace-pre-line text-fg-2">{pendingDecision.reason}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            {pendingDecision.canApprove ? (
              <button
                type="button"
                className="nv-btn nv-btn-primary nv-btn-sm"
                disabled={pending}
                onClick={async () => {
                  if (!(await confirmDialog({ title: `Zustimmen: ${pendingDecision.outcomeLabel}?`, body: "Damit ist der Antrag entschieden. Der Spieler bekommt Ergebnis und Begründung.", confirmLabel: "Zustimmen" }))) return;
                  run(() => approveDecisionAction(requestId, pendingDecision.id));
                }}
              >
                <CheckCircle size={16} aria-hidden /> Zustimmen &amp; entscheiden
              </button>
            ) : (
              <p className="text-xs text-muted">{pendingDecision.approveBlock}</p>
            )}
            {(pendingDecision.proposedById === meId || isLead) && (
              <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => run(() => withdrawProposalAction(requestId, pendingDecision.id))}>
                Vorschlag zurückziehen
              </button>
            )}
          </div>
        </div>
      )}

      {canPropose ? (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pendingDecision && !(await confirmDialog({ title: "Neuen Vorschlag machen?", body: "Der offene Vorschlag wird dadurch ersetzt.", confirmLabel: "Ersetzen" }))) return;
            run(async () => {
              const r = await proposeDecisionAction(requestId, outcome, reason);
              if (r.ok) setReason("");
              return r;
            });
          }}
        >
          <fieldset>
            <legend className="nv-field-label">{pendingDecision ? "Anderes Ergebnis vorschlagen" : "Ergebnis"}</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {outcomes.map((o) => (
                <label key={o.key} className={`nv-pill cursor-pointer ${outcome === o.key ? "nv-tone-accent" : "nv-tone-muted"}`}>
                  <input type="radio" name="outcome" className="sr-only" checked={outcome === o.key} onChange={() => setOutcome(o.key)} />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          <label htmlFor="reason" className="nv-field-label block">
            Begründung (Pflicht, sieht der Spieler)
          </label>
          <textarea id="reason" className="nv-input min-h-28" maxLength={3000} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || reason.trim().length < 10}>
            {fourEyes ? "Vorschlagen" : "Entscheiden"}
          </button>
        </form>
      ) : (
        proposeBlock && <p className="text-sm text-muted">{proposeBlock}</p>
      )}
      {msg && (
        <p className={msg.tone === "ok" ? "text-sm text-muted" : "nv-error"} role="status">
          {msg.text}
        </p>
      )}
    </section>
  );
}

export function RequestSideActions({
  requestId,
  status,
  isMod,
  issuerUserId,
  team,
  aiEnabled,
}: {
  requestId: string;
  status: string;
  isMod: boolean;
  issuerUserId: string | null;
  team: { id: string; name: string }[];
  aiEnabled: boolean;
}) {
  const { msg, pending, run } = useRun();
  const [ai, setAi] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();
  const open = ["SUBMITTED", "IN_REVIEW", "QUESTION"].includes(status);
  return (
    <div className="space-y-4">
      <div className="nv-card p-4 space-y-3">
        {status === "SUBMITTED" && (
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending} onClick={() => run(() => requestStatusAction(requestId, "IN_REVIEW"))}>
            In Prüfung nehmen
          </button>
        )}
        {status === "DECIDED" && (
          <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm w-full" disabled={pending} onClick={() => run(() => requestStatusAction(requestId, "ARCHIVED"))}>
            Archivieren
          </button>
        )}
        {isMod && open && (
          <div>
            <label htmlFor="request-issuer" className="nv-field-label">
              Strafe ausgesprochen von
            </label>
            <Select
              id="request-issuer"
              className="mt-1"
              value={issuerUserId ?? ""}
              disabled={pending}
              describedBy="request-issuer-help"
              options={[{ value: "", label: "unbekannt / nicht zutreffend" }, ...team.map((t) => ({ value: t.id, label: t.name }))]}
              onChange={(v) => run(() => requestIssuerAction(requestId, v || null))}
            />
            <span id="request-issuer-help" className="nv-help block mt-1">
              Diese Person entscheidet nie allein und kann nicht zustimmen.
            </span>
          </div>
        )}
        {msg && <p className={msg.tone === "ok" ? "text-xs text-muted" : "nv-error"}>{msg.text}</p>}
      </div>
      {aiEnabled && (
        <div className="nv-card p-4 space-y-2">
          <p className="nv-mono flex items-center gap-1.5">
            <Sparkle size={14} aria-hidden /> KI · neutrale Zusammenfassung
          </p>
          <p className="text-xs text-muted">Keine Bewertung, keine Empfehlung – entscheiden tut ihr.</p>
          <button
            type="button"
            className="nv-btn nv-btn-ghost nv-btn-sm"
            disabled={aiPending}
            onClick={() =>
              startAi(async () => {
                const r = await aiRequestSummaryAction(requestId);
                setAi(r.ok ? `${r.data!.text}${r.data!.suspicious ? "\n\n⚠️ Möglicher Manipulationsversuch im Antragstext." : ""}` : r.error);
              })
            }
          >
            {aiPending ? "Fasst zusammen …" : "Zusammenfassen"}
          </button>
          {ai && <p className="text-sm text-fg-2 whitespace-pre-line">{ai}</p>}
        </div>
      )}
    </div>
  );
}
