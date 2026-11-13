"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ThumbsDown, ThumbsUp } from "@phosphor-icons/react/ssr";
import { articleFeedbackAction } from "@/app/actions/help";

export function ArticleFeedback({ articleId }: { articleId: string }) {
  const [helpful, setHelpful] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const send = (value: boolean, withComment = false) =>
    start(async () => {
      setError(null);
      const r = await articleFeedbackAction({ articleId, helpful: value, comment: withComment ? comment : undefined });
      if (!r.ok) setError(r.error);
      else if (withComment) setSent(true);
    });

  return (
    <section aria-labelledby="feedback-title" className="nv-card p-5 sm:p-6">
      <h2 id="feedback-title" className="font-semibold">
        Hat dir das geholfen?
      </h2>
      <p className="text-xs text-muted mt-1">Anonym – wir sehen nur Ja/Nein und deinen Kommentar, nicht wer du bist.</p>
      <div className="mt-4 flex gap-2" role="group" aria-label="Bewertung">
        <button
          type="button"
          disabled={pending}
          aria-pressed={helpful === true}
          onClick={() => {
            setHelpful(true);
            send(true);
          }}
          className={`nv-btn nv-btn-sm ${helpful === true ? "nv-btn-primary" : "nv-btn-ghost"}`}
        >
          <ThumbsUp size={16} aria-hidden /> Ja
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={helpful === false}
          onClick={() => {
            setHelpful(false);
            send(false);
          }}
          className={`nv-btn nv-btn-sm ${helpful === false ? "nv-btn-primary" : "nv-btn-ghost"}`}
        >
          <ThumbsDown size={16} aria-hidden /> Nein
        </button>
      </div>
      {helpful !== null && !sent && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (comment.trim()) send(helpful, true);
          }}
        >
          <label htmlFor="fb-comment" className="nv-field-label">
            {helpful ? "Was war besonders hilfreich? (optional)" : "Was hat gefehlt? (optional)"}
          </label>
          <textarea id="fb-comment" className="nv-input min-h-20" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Bitte keine persönlichen Daten." />
          <button type="submit" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending || !comment.trim()}>
            Kommentar senden
          </button>
        </form>
      )}
      {helpful !== null && (
        <p className="mt-3 text-sm text-muted" role="status">
          {sent ? "Danke für deinen Kommentar!" : "Danke für deine Rückmeldung!"}
          {helpful === false && (
            <>
              {" "}
              Brauchst du direkt Hilfe?{" "}
              <Link href="/tickets/neu" className="nv-link">
                Ticket erstellen
              </Link>
            </>
          )}
        </p>
      )}
      {error && <p className="nv-error mt-2">{error}</p>}
    </section>
  );
}
