"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PaperPlaneRight, Star } from "@phosphor-icons/react/ssr";
import type { TicketStatus } from "@prisma/client";
import { closeTicketAction, rateTicketAction, replyTicketAction } from "@/app/actions/tickets";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";
import { confirmDialog } from "@/components/ConfirmDialog";

export function StarRating({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Bewertung" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} von 5 Sternen`}
          disabled={disabled}
          onClick={() => onChange(n)}
          className="p-1 rounded-md hover:bg-card-hover"
        >
          <Star size={28} weight={n <= value ? "fill" : "regular"} className={n <= value ? "text-[color:var(--tone-warn)]" : "text-faint"} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function PlayerTicketActions({ ticketId, status, rating, ratingComment }: { ticketId: string; status: TicketStatus; rating: number | null; ratingComment: string | null }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [stars, setStars] = useState(rating ?? 0);
  const [comment, setComment] = useState(ratingComment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  if (status === "CLOSED") {
    return (
      <section className="nv-card p-5 sm:p-6" aria-labelledby="rate-title">
        <h2 id="rate-title" className="font-semibold">
          Wie zufrieden warst du?
        </h2>
        <p className="text-sm text-muted mt-1">Das Ticket ist geschlossen. Deine Bewertung hilft uns, besser zu werden.</p>
        <div className="mt-3">
          <StarRating value={stars} onChange={setStars} disabled={pending} />
        </div>
        <label htmlFor="rate-comment" className="nv-field-label mt-4 block">
          Kommentar (optional)
        </label>
        <textarea id="rate-comment" className="nv-input min-h-20 mt-1.5" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />
        <button
          type="button"
          className="nv-btn nv-btn-primary nv-btn-sm mt-3"
          disabled={!stars || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await rateTicketAction({ ticketId, rating: stars, comment });
              if (!r.ok) setError(r.error);
              else setSaved(true);
            })
          }
        >
          {rating ? "Bewertung ändern" : "Bewerten"}
        </button>
        {saved && <p className="text-sm text-muted mt-2" role="status">Danke!</p>}
        {error && <p className="nv-error mt-2">{error}</p>}
        <p className="text-sm text-muted mt-4">Neues Problem? Mach einfach ein neues Ticket auf.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="reply-title" className="nv-card p-5 sm:p-6">
      <h2 id="reply-title" className="font-semibold">
        Antworten
      </h2>
      <form
        className="mt-3 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length < 2) return setError("Die Nachricht ist leer.");
          start(async () => {
            setError(null);
            const r = await replyTicketAction({ ticketId, body, ...att });
            if (!r.ok) return setError(r.error);
            setBody("");
            setAtt({ attachmentIds: [], links: [] });
            router.refresh();
          });
        }}
      >
        <label htmlFor="reply-body" className="sr-only">
          Nachricht
        </label>
        <textarea id="reply-body" className="nv-input min-h-28" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Deine Nachricht ans Team …" />
        <AttachmentInput value={att} onChange={setAtt} compact />
        {error && (
          <p className="nv-error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
            <PaperPlaneRight size={16} aria-hidden /> Senden
          </button>
          <button
            type="button"
            className="nv-btn nv-btn-ghost nv-btn-sm"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmDialog({ title: "Ticket schließen?", body: "Hat sich alles erledigt? Danach kannst du nicht mehr antworten.", confirmLabel: "Schließen" }))) return;
              start(async () => {
                const r = await closeTicketAction(ticketId);
                if (!r.ok) setError(r.error);
                router.refresh();
              });
            }}
          >
            Problem gelöst – schließen
          </button>
        </div>
      </form>
    </section>
  );
}
