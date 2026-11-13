"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import { PaperPlaneRight } from "@phosphor-icons/react/ssr";
import { answerRequestAction } from "@/app/actions/requests";
import { AttachmentInput, type AttachmentValue } from "@/components/AttachmentInput";
import { useLiveThread } from "@/components/live/Live";

export function RequestAnswerForm({ requestId, question }: { requestId: string; question: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [att, setAtt] = useState<AttachmentValue>({ attachmentIds: [], links: [] });
  const [error, setError] = useState<string | null>(null);
  const live = useLiveThread();

  const send = async () => {
    const text = body;
    const attachments = att;
    setError(null);
    setBody("");
    setAtt({ attachmentIds: [], links: [] });
    const run = () => answerRequestAction({ requestId, body: text, ...attachments });
    const r = live ? await live.send({ kind: "PLAYER", body: text, attachmentCount: attachments.attachmentIds.length + attachments.links.length }, run) : await run();
    if (!r.ok) {
      setBody(text);
      setAtt(attachments);
      setError(r.error ?? "Senden fehlgeschlagen.");
      return;
    }
    startTransition(() => router.refresh());
  };

  return (
    <form
      className="nv-card p-5 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim().length >= 2) void send();
      }}
    >
      <label htmlFor="req-answer" className="font-semibold block">
        {question ? "Rückfrage beantworten" : "Nachricht ans Team / Nachreichen"}
      </label>
      <textarea
        id="req-answer"
        className="nv-input min-h-28"
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
        }}
        placeholder="Strg + Enter zum Senden"
      />
      <AttachmentInput value={att} onChange={setAtt} compact />
      {error && (
        <p className="nv-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={body.trim().length < 2}>
        <PaperPlaneRight size={16} aria-hidden /> Senden
      </button>
    </form>
  );
}
