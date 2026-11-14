"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MessageKind } from "@prisma/client";
import { MessageList, type ListMessage } from "@/components/tickets/MessageList";
import { LIVE_EVENT } from "@/lib/live-channels";

// ─── Push (Pusher), falls eingerichtet ────────────────────────

type PusherLike = import("pusher-js").default;
let pusherPromise: Promise<PusherLike | null> | null = null;

function getPusher(): Promise<PusherLike | null> {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return Promise.resolve(null);
  pusherPromise ??= import("pusher-js")
    .then(({ default: Pusher }) => {
      // Selbst gehostet (z. B. Soketi): eigener Host/Port
      const host = process.env.NEXT_PUBLIC_PUSHER_HOST;
      const port = Number(process.env.NEXT_PUBLIC_PUSHER_PORT) || undefined;
      const tls = process.env.NEXT_PUBLIC_PUSHER_TLS !== "false";
      return new Pusher(key, {
        cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "eu",
        forceTLS: tls,
        ...(host ? { wsHost: host, wsPort: port, wssPort: port, enabledTransports: tls ? ["wss" as const] : ["ws" as const] } : {}),
      });
    })
    .catch((e) => {
      console.warn("[live] Push nicht verfügbar – nutze Nachfragen", e);
      return null;
    });
  return pusherPromise;
}

// ─── Push statt Nachfragen ────────────────────────────────────

/**
 * Keine Hintergrund-Abfragen: Die Seite fragt NIE von selbst beim Server nach.
 * Ist Pusher eingerichtet, kommt bei Änderungen ein Signal (über Pusher, nicht
 * über Vercel) und die Seite lädt einmal nach. Ohne Pusher sieht man Neues beim
 * nächsten Seitenaufruf.
 */
export function usePushRefresh(channels: string[] = []) {
  const router = useRouter();
  const channelKey = channels.join(",");
  useEffect(() => {
    if (!channelKey) return;
    let cancelled = false;
    let throttle: ReturnType<typeof setTimeout> | undefined;
    let cleanup = () => {};
    void getPusher().then((pusher) => {
      if (!pusher || cancelled) return;
      const onChange = () => {
        clearTimeout(throttle);
        throttle = setTimeout(() => startTransition(() => router.refresh()), 120);
      };
      const subs = channelKey.split(",").map((name) => {
        const ch = pusher.subscribe(name);
        ch.bind(LIVE_EVENT, onChange);
        return { name, ch };
      });
      cleanup = () => {
        for (const { name, ch } of subs) {
          ch.unbind(LIVE_EVENT, onChange);
          pusher.unsubscribe(name);
        }
      };
    });
    return () => {
      cancelled = true;
      clearTimeout(throttle);
      cleanup();
    };
  }, [channelKey, router]);
}

/** Nur Push (z. B. Team-Listen, Kanban) */
export function LiveRefresh({ channels }: { channels?: string[] }) {
  usePushRefresh(channels);
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

export function LiveThreadProvider({ viewerName, channels, children }: { viewerName: string; channels?: string[]; children: ReactNode }) {
  const [local, setLocal] = useState<LocalMessage[]>([]);
  usePushRefresh(channels);

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
