"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MessageKind } from "@prisma/client";
import { MessageList, type ListMessage } from "@/components/tickets/MessageList";

// ─── Polling ──────────────────────────────────────────────────

/**
 * Fragt die Live-Version ab (nur bei sichtbarem Tab) und lädt die Seite im
 * Hintergrund neu, sobald sich etwas geändert hat. Takt: 4 s nach Aktivität,
 * nach 1 Min. Ruhe 10 s, nach 5 Min. 20 s.
 */
export function useLiveRefresh(query: string, version: string) {
  const router = useRouter();
  const current = useRef(version);
  useEffect(() => {
    current.current = version;
  }, [version]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastChange = Date.now();

    const schedule = () => {
      if (stopped) return;
      const idle = Date.now() - lastChange;
      timer = setTimeout(tick, idle < 60_000 ? 4_000 : idle < 300_000 ? 10_000 : 20_000);
    };
    const tick = async () => {
      if (stopped) return;
      if (document.hidden) return schedule();
      try {
        const res = await fetch(`/api/live?${query}`, { cache: "no-store" });
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          stopped = true;
          return;
        }
        if (res.ok) {
          const { v } = (await res.json()) as { v?: string };
          if (v && v !== current.current) {
            current.current = v;
            lastChange = Date.now();
            startTransition(() => router.refresh());
          }
        }
      } catch {
        // offline o. Ä. – beim nächsten Takt wieder
      }
      schedule();
    };
    const onVisible = () => {
      if (document.hidden || stopped) return;
      clearTimeout(timer);
      lastChange = Date.now();
      void tick();
    };
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [query, router]);
}

/** Nur Polling, ohne Nachrichten (z. B. Team-Listen, Kanban) */
export function LiveRefresh({ query, version }: { query: string; version: string }) {
  useLiveRefresh(query, version);
  return null;
}

// ─── Sofort sichtbare Nachrichten ─────────────────────────────

interface LocalMessage {
  tempId: string;
  kind: MessageKind;
  body: string;
  sentAt: number;
  state: "sending" | "sent";
  attachmentCount: number;
}

type SendResult = { ok: boolean; error?: string };

interface LiveThreadApi {
  /** Nachricht sofort anzeigen, dann `run` ausführen. Bei Fehler verschwindet sie wieder. */
  send(input: { kind: MessageKind; body: string; attachmentCount?: number }, run: () => Promise<SendResult>): Promise<SendResult>;
  local: LocalMessage[];
  viewerName: string;
}

const LiveThreadContext = createContext<LiveThreadApi | null>(null);

export const useLiveThread = () => useContext(LiveThreadContext);

export function LiveThreadProvider({ query, version, viewerName, children }: { query: string; version: string; viewerName: string; children: ReactNode }) {
  const [local, setLocal] = useState<LocalMessage[]>([]);
  useLiveRefresh(query, version);

  const send = useCallback<LiveThreadApi["send"]>(async ({ kind, body, attachmentCount = 0 }, run) => {
    const tempId = `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setLocal((l) => [...l, { tempId, kind, body: body.trim(), sentAt: Date.now(), state: "sending", attachmentCount }]);
    let r: SendResult;
    try {
      r = await run();
    } catch {
      r = { ok: false, error: "Verbindung fehlgeschlagen – bitte nochmal senden." };
    }
    if (!r.ok) {
      setLocal((l) => l.filter((m) => m.tempId !== tempId));
      return r;
    }
    setLocal((l) => l.map((m) => (m.tempId === tempId ? { ...m, state: "sent" } : m)));
    // Fallback, falls der Server den Text leicht verändert gespeichert hat
    setTimeout(() => setLocal((l) => l.filter((m) => m.tempId !== tempId)), 30_000);
    return r;
  }, []);

  const api = useMemo(() => ({ send, local, viewerName }), [send, local, viewerName]);
  return <LiveThreadContext.Provider value={api}>{children}</LiveThreadContext.Provider>;
}

/** Verlauf vom Server + eigene, gerade gesendete Nachrichten (bis der Server sie liefert) */
export function LiveMessages({ messages, perspective }: { messages: ListMessage[]; perspective: "player" | "team" }) {
  const live = useLiveThread();
  const pending = (live?.local ?? []).filter(
    (l) => !messages.some((m) => m.kind === l.kind && m.body.trim() === l.body && new Date(m.createdAt).getTime() >= l.sentAt - 120_000),
  );
  const all: ListMessage[] = [
    ...messages,
    ...pending.map((l) => ({
      id: l.tempId,
      kind: l.kind,
      authorName: live?.viewerName ?? "Du",
      body: l.body,
      source: "WEB" as const,
      createdAt: new Date(l.sentAt),
      attachments: [],
      localState: l.state,
      localAttachments: l.attachmentCount,
    })),
  ];
  return <MessageList messages={all} perspective={perspective} />;
}
