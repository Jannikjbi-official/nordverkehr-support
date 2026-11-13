"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react/ssr";
import { answerRequestAction } from "@/app/actions/requests";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";

export function RequestAnswerForm({ requestId, question }: { requestId: string; question: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="nv-card p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          const r = await answerRequestAction({ requestId, body, ...att });
          if (!r.ok) return setError(r.error);
          setBody("");
          setAtt({ attachmentIds: [], links: [] });
          router.refresh();
        });
      }}
    >
      <label htmlFor="req-answer" className="font-semibold block">
        {question ? "Rückfrage beantworten" : "Nachricht ans Team / Nachreichen"}
      </label>
      <textarea id="req-answer" className="nv-input min-h-28" maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      <AttachmentInput value={att} onChange={setAtt} compact />
      {error && (
        <p className="nv-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending || body.trim().length < 2}>
        <PaperPlaneRight size={16} aria-hidden /> Senden
      </button>
    </form>
  );
}
