"use client";

import { useState, useTransition } from "react";
import { ChatsCircle, LockSimple, PaperPlaneRight, Sparkle } from "@phosphor-icons/react/ssr";
import { renderTemplate, type TemplateVars } from "@/lib/messages/placeholders";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";

export interface ComposerTemplate {
  id: string;
  title: string;
  body: string;
}

export interface ComposerSendInput {
  body: string;
  internal: boolean;
  extra: string;
  attachments: AttachmentValue;
}

/**
 * Antwort-Editor fürs Team: Bausteine mit Platzhaltern, optional interne Notiz,
 * optional KI-Entwurf (nur Vorschlag – gesendet wird erst per Klick).
 */
export function Composer({
  templates,
  vars,
  onSend,
  allowInternal = true,
  extraOptions,
  extraLabel,
  aiDraft,
  sendLabel = "Senden",
  placeholder = "Antwort an den Spieler …",
  hint,
}: {
  templates: ComposerTemplate[];
  vars: TemplateVars;
  onSend: (i: ComposerSendInput) => Promise<{ ok: boolean; error?: string }>;
  allowInternal?: boolean;
  extraOptions?: { value: string; label: string }[];
  extraLabel?: string;
  aiDraft?: (() => Promise<{ ok: true; text: string; note?: string } | { ok: false; error: string }>) | null;
  sendLabel?: string;
  placeholder?: string;
  hint?: string;
}) {
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [extra, setExtra] = useState(extraOptions?.[0]?.value ?? "");
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [aiPending, startAi] = useTransition();
  const missing = renderTemplate(body, vars).missing;

  const insert = (t: ComposerTemplate) => {
    const { text } = renderTemplate(t.body, vars);
    setBody((b) => (b.trim() ? `${b.trim()}\n\n${text}` : text));
  };

  return (
    <section className={`nv-card p-5 ${internal ? "!border-[color:var(--tone-warn)]" : ""}`} aria-label="Antwort schreiben">
      <div className="flex flex-wrap gap-2 items-center">
        {templates.length > 0 && (
          <label className="flex items-center gap-2 text-sm">
            <ChatsCircle size={16} className="text-muted" aria-hidden />
            <span className="sr-only">Baustein einfügen</span>
            <select
              className="nv-input !py-1.5 text-sm max-w-[260px]"
              value=""
              onChange={(e) => {
                const t = templates.find((x) => x.id === e.target.value);
                if (t) insert(t);
              }}
            >
              <option value="">Baustein einfügen …</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {aiDraft && (
          <button
            type="button"
            className="nv-btn nv-btn-ghost nv-btn-sm"
            disabled={aiPending}
            onClick={() =>
              startAi(async () => {
                setError(null);
                const r = await aiDraft();
                if (!r.ok) return setError(r.error);
                setBody(r.text);
                setNote(r.note ?? "KI-Entwurf eingefügt – bitte prüfen und anpassen. Gesendet wird erst, wenn du auf Senden klickst.");
              })
            }
          >
            <Sparkle size={16} aria-hidden /> {aiPending ? "Entwurf wird geschrieben …" : "KI-Entwurf"}
          </button>
        )}
        {allowInternal && (
          <label className="flex items-center gap-2 text-sm ml-auto cursor-pointer">
            <input type="checkbox" className="nv-check" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
            <LockSimple size={14} aria-hidden /> Interne Notiz
          </label>
        )}
      </div>
      <label htmlFor="composer-body" className="sr-only">
        Nachricht
      </label>
      <textarea
        id="composer-body"
        className="nv-input min-h-36 mt-3"
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={internal ? "Nur fürs Team sichtbar – nie für den Spieler, nie in Discord." : placeholder}
      />
      {note && <p className="nv-help mt-1">{note}</p>}
      {missing.length > 0 && <p className="nv-help mt-1 text-[color:var(--tone-warn)]">Platzhalter ohne Wert: {missing.map((m) => `{${m}}`).join(", ")}</p>}
      {!internal && (
        <div className="mt-3">
          <AttachmentInput value={att} onChange={setAtt} compact />
        </div>
      )}
      {hint && !internal && <p className="nv-help mt-2">{hint}</p>}
      {error && (
        <p className="nv-error mt-2" role="alert">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {extraOptions && !internal && (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">{extraLabel}</span>
            <select className="nv-input !py-1.5 text-sm" value={extra} onChange={(e) => setExtra(e.target.value)}>
              {extraOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm ml-auto"
          disabled={pending || body.trim().length < 2}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await onSend({ body, internal, extra, attachments: att });
              if (!r.ok) return setError(r.error ?? "Fehler");
              setBody("");
              setNote(null);
              setAtt({ attachmentIds: [], links: [] });
            })
          }
        >
          <PaperPlaneRight size={16} aria-hidden /> {internal ? "Notiz speichern" : sendLabel}
        </button>
      </div>
    </section>
  );
}
