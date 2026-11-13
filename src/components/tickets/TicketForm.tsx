"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowRight, Lightbulb, ShieldWarning } from "@phosphor-icons/react/ssr";
import { TICKET_CATEGORIES, fieldsSchema, getCategory, type FieldDef } from "@/lib/tickets/categories";
import { createTicketAction, suggestArticlesAction } from "@/app/actions/tickets";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";
import { NvIcon } from "@/components/icons";

interface Props {
  initialCategory: string;
  initialSubject: string;
  team: { id: string; name: string }[];
  needsConsent: boolean;
  discordEnabled: boolean;
}

export function FieldInput({ f, value, onChange, error }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string }) {
  const id = `f-${f.key}`;
  const common = { id, name: f.key, "aria-invalid": error ? true : undefined, "aria-describedby": f.help || error ? `${id}-hint` : undefined };
  const hint = (f.help || error) && (
    <p id={`${id}-hint`} className={error ? "nv-error" : "nv-help"}>
      {error ?? f.help}
    </p>
  );
  if (f.type === "checkbox") {
    return (
      <div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" className="nv-check mt-0.5" {...common} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span className="text-sm">{f.label}</span>
        </label>
        {hint}
      </div>
    );
  }
  const label = (
    <label htmlFor={id} className="nv-field-label">
      {f.label}
      {f.required && <span className="text-red-text"> *</span>}
    </label>
  );
  const v = typeof value === "string" ? value : "";
  return (
    <div className="space-y-1.5">
      {label}
      {f.type === "textarea" ? (
        <textarea className="nv-input min-h-28" maxLength={f.max} {...common} value={v} placeholder={f.placeholder} onChange={(e) => onChange(e.target.value)} required={f.required} />
      ) : f.type === "select" ? (
        <select className="nv-input" {...common} value={v} onChange={(e) => onChange(e.target.value)} required={f.required}>
          <option value="">Bitte wählen …</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="nv-input"
          type={f.type === "url" ? "url" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"}
          maxLength={f.max}
          {...common}
          value={v}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value)}
          required={f.required}
        />
      )}
      {hint}
    </div>
  );
}

export function TicketForm({ initialCategory, initialSubject, team, needsConsent, discordEnabled }: Props) {
  const router = useRouter();
  const [category, setCategory] = useState(initialCategory);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [accused, setAccused] = useState<string[]>([]);
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ title: string; url: string; summary: string }[]>([]);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const honeypot = useRef<HTMLInputElement>(null);
  const cat = getCategory(category);

  // Artikelvorschläge beim Schreiben (entprellt)
  const text = `${subject} ${body}`;
  useEffect(() => {
    if (!category) return;
    const t = setTimeout(() => {
      suggestArticlesAction(text, category).then(setSuggestions).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [text, category]);

  const visibleFields = useMemo(() => (cat?.fields ?? []).filter((f) => !f.showIf || fields[f.showIf] === true), [cat, fields]);
  const teamComplaint = category === "beschwerde" && fields.teamComplaint === true;

  const submit = () => {
    setFormError(null);
    if (!cat) return setFormError("Bitte wähl eine Kategorie.");
    const parsed = fieldsSchema(cat).safeParse(fields);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (subject.trim().length < 4) errs.subject = "Bitte gib einen kurzen Betreff an.";
    if (body.trim().length < 10) errs.body = "Beschreib dein Anliegen bitte etwas genauer.";
    if (needsConsent && !consent) errs.consent = "Bitte bestätige den Datenschutz-Hinweis.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    start(async () => {
      const r = await createTicketAction({
        category,
        subject,
        body,
        fields,
        accusedUserIds: teamComplaint ? accused : [],
        consent,
        honeypot: honeypot.current?.value,
        startedAt: startedAt.current,
        ...att,
      });
      if (!r.ok) return setFormError(r.error);
      router.push(`/tickets/${r.data!.id}?neu=1`);
    });
  };

  return (
    <form
      className="grid gap-8 lg:grid-cols-[1fr_320px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      noValidate
    >
      <div className="space-y-8 min-w-0">
        <fieldset>
          <legend className="nv-mono mb-3">1 · Kategorie</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {TICKET_CATEGORIES.map((c) => (
              <label key={c.key} className={`nv-card p-4 flex gap-3 cursor-pointer transition-colors ${category === c.key ? "!border-red bg-red-soft" : "hover:bg-card-hover"}`}>
                <input type="radio" name="category" value={c.key} className="sr-only" checked={category === c.key} onChange={() => setCategory(c.key)} />
                <NvIcon name={c.icon} className="text-red-text shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold block">{c.label}</span>
                  <span className="text-sm text-muted">{c.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {cat && (
          <>
            <fieldset className="space-y-5">
              <legend className="nv-mono mb-3">2 · Dein Anliegen</legend>
              <div className="space-y-1.5">
                <label htmlFor="f-subject" className="nv-field-label">
                  Betreff <span className="text-red-text">*</span>
                </label>
                <input id="f-subject" className="nv-input" maxLength={140} value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={errors.subject ? true : undefined} placeholder="Kurz und knapp, z. B. „Kein Ton im TeamSpeak“" />
                {errors.subject && <p className="nv-error">{errors.subject}</p>}
              </div>
              {visibleFields.map((f) => (
                <FieldInput key={f.key} f={f} value={fields[f.key]} error={errors[f.key]} onChange={(v) => setFields((s) => ({ ...s, [f.key]: v }))} />
              ))}
              {teamComplaint && (
                <div className="rounded-xl border border-red-line bg-red-soft p-4 space-y-3">
                  <p className="flex items-center gap-2 font-semibold text-sm">
                    <ShieldWarning size={18} aria-hidden /> Beschwerde über ein Teammitglied
                  </p>
                  <p className="text-sm text-fg-2">
                    Dein Ticket sieht nur die Moderation bzw. Leitung. Wer betroffen ist, sieht es nie – auch nicht in Discord (es gibt keinen Thread). Weißt du nicht, wer es war? Dann lass die Auswahl leer, die Leitung kümmert sich.
                  </p>
                  <fieldset>
                    <legend className="nv-field-label">Um wen geht es? (optional)</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {team.map((t) => (
                        <label key={t.id} className={`nv-pill cursor-pointer ${accused.includes(t.id) ? "nv-tone-accent" : "nv-tone-muted"}`}>
                          <input type="checkbox" className="sr-only" checked={accused.includes(t.id)} onChange={(e) => setAccused((a) => (e.target.checked ? [...a, t.id].slice(0, 5) : a.filter((x) => x !== t.id)))} />
                          {t.name}
                        </label>
                      ))}
                      {!team.length && <span className="text-sm text-muted">Keine Teammitglieder hinterlegt – beschreib es einfach im Text.</span>}
                    </div>
                  </fieldset>
                </div>
              )}
              <div className="space-y-1.5">
                <label htmlFor="f-body" className="nv-field-label">
                  Beschreibung <span className="text-red-text">*</span>
                </label>
                <textarea id="f-body" className="nv-input min-h-40" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} aria-invalid={errors.body ? true : undefined} placeholder="Was ist passiert? Was hast du schon probiert?" />
                <p className={errors.body ? "nv-error" : "nv-help"}>{errors.body ?? `${body.length}/4000`}</p>
              </div>
            </fieldset>

            <fieldset>
              <legend className="nv-mono mb-3">3 · Anhänge (optional)</legend>
              <AttachmentInput value={att} onChange={setAtt} />
            </fieldset>

            {needsConsent && (
              <div>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input id="f-consent" type="checkbox" className="nv-check mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={errors.consent ? true : undefined} />
                  <span className="text-sm">
                    Ich habe den{" "}
                    <Link href="/datenschutz" className="nv-link" target="_blank">
                      Datenschutz-Hinweis
                    </Link>{" "}
                    gelesen. Meine Angaben werden zur Bearbeitung gespeichert{discordEnabled && !teamComplaint ? " und im privaten Discord-Thread gespiegelt" : ""}.
                  </span>
                </label>
                {errors.consent && <p className="nv-error mt-1">{errors.consent}</p>}
              </div>
            )}

            {/* Honeypot: für Menschen unsichtbar */}
            <div className="hidden" aria-hidden>
              <label>
                Website <input ref={honeypot} tabIndex={-1} autoComplete="off" name="website" />
              </label>
            </div>

            {formError && (
              <p className="nv-error" role="alert">
                {formError}
              </p>
            )}
            <button type="submit" className="nv-btn nv-btn-primary" disabled={pending}>
              {pending ? "Wird gesendet …" : "Ticket absenden"} <ArrowRight size={16} aria-hidden />
            </button>
          </>
        )}
      </div>

      <aside className="space-y-4 self-start" aria-live="polite">
        <div className="nv-card p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Lightbulb size={20} className="text-red-text" aria-hidden /> Vielleicht hilft dir das schon
          </p>
          {suggestions.length === 0 ? (
            <p className="text-sm text-muted mt-2">Sobald du schreibst, schlagen wir dir passende Hilfe-Artikel vor.</p>
          ) : (
            <ul className="mt-3 space-y-3">
              {suggestions.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noopener" className="block group">
                    <span className="font-medium group-hover:underline">{s.title}</span>
                    <span className="block text-xs text-muted line-clamp-2">{s.summary}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </form>
  );
}
