"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { answersSchema, type FieldDef } from "@/lib/requests/model";
import { submitRequestAction } from "@/app/actions/requests";
import { FieldInput } from "@/components/tickets/TicketForm";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";

export function RequestForm({ typeSlug, fields, requireHonesty, needsConsent, discordId }: { typeSlug: string; fields: FieldDef[]; requireHonesty: boolean; needsConsent: boolean; discordId: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [honesty, setHonesty] = useState(false);
  const [consent, setConsent] = useState(false);
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = Date.now();
  }, []);
  const honeypot = useRef<HTMLInputElement>(null);

  const submit = () => {
    setFormError(null);
    const parsed = answersSchema(fields).safeParse(answers);
    const errs: Record<string, string> = {};
    if (!parsed.success) for (const i of parsed.error.issues) errs[String(i.path[0])] ??= i.message;
    if (requireHonesty && !honesty) errs.honesty = "Bitte bestätigen.";
    if (needsConsent && !consent) errs.consent = "Bitte bestätige den Datenschutz-Hinweis.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      document.getElementById(`f-${Object.keys(errs)[0]}`)?.focus();
      return;
    }
    start(async () => {
      const r = await submitRequestAction({ typeSlug, answers, honesty, consent, honeypot: honeypot.current?.value, startedAt: startedAt.current, ...att });
      if (!r.ok) return setFormError(r.error);
      router.push(`/antraege/${r.data!.id}?neu=1`);
    });
  };

  return (
    <form
      className="nv-card p-5 sm:p-7 space-y-6 min-w-0"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-xs text-muted flex flex-wrap items-center gap-x-2 gap-y-1 pb-5 border-b border-line">
        <span className="nv-pill nv-tone-muted !normal-case">Felder mit * sind Pflicht</span>
        <span>
          Deine Discord-ID wird automatisch angehängt: <span className="font-mono text-fg-2">{discordId}</span>
        </span>
      </p>
      {fields.map((f) => (
        <FieldInput key={f.key} f={f} value={answers[f.key]} error={errors[f.key]} onChange={(v) => setAnswers((a) => ({ ...a, [f.key]: v }))} />
      ))}
      <fieldset>
        <legend className="nv-field-label mb-2">Weitere Belege (optional)</legend>
        <AttachmentInput value={att} onChange={setAtt} />
      </fieldset>
      {requireHonesty && (
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input id="f-honesty" type="checkbox" className="nv-check mt-0.5" checked={honesty} onChange={(e) => setHonesty(e.target.checked)} aria-invalid={errors.honesty ? true : undefined} />
            <span className="text-sm font-medium">Ich habe ehrlich geantwortet. Falsche Angaben führen zur Ablehnung.</span>
          </label>
          {errors.honesty && <p className="nv-error mt-1">{errors.honesty}</p>}
        </div>
      )}
      {needsConsent && (
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input id="f-consent" type="checkbox" className="nv-check mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} aria-invalid={errors.consent ? true : undefined} />
            <span className="text-sm">
              Ich habe den{" "}
              <Link href="/datenschutz" className="nv-link" target="_blank">
                Datenschutz-Hinweis
              </Link>{" "}
              gelesen. Meine Angaben werden zur Prüfung gespeichert.
            </span>
          </label>
          {errors.consent && <p className="nv-error mt-1">{errors.consent}</p>}
        </div>
      )}
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
      <div className="pt-5 border-t border-line flex flex-wrap items-center gap-4">
        <button type="submit" className="nv-btn nv-btn-primary" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Wird eingereicht …" : "Antrag einreichen"} <ArrowRight size={16} aria-hidden />
        </button>
        <p className="text-xs text-muted flex-1 min-w-[12rem]">Danach kannst du die Angaben nicht mehr ändern – aber jederzeit etwas nachreichen.</p>
      </div>
    </form>
  );
}
