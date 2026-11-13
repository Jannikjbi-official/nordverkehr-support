import { DiscordLogo, LinkSimple, LockSimple } from "@phosphor-icons/react/ssr";
import type { DeliveryStatus, MessageKind, Source } from "@prisma/client";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { DeliveryBadge, cn, formatDayTime } from "@/components/ui";

export interface ListMessage {
  id: string;
  kind: MessageKind;
  authorName: string;
  body: string;
  source: Source;
  createdAt: Date;
  deliveryStatus?: DeliveryStatus;
  attachments: { id: string; kind: "IMAGE" | "LINK"; url: string | null; provider: string | null; fileName: string | null }[];
}

/** Verlauf eines Tickets/Antrags. `perspective` bestimmt, welche Seite „eigene“ Nachrichten sind. */
export function MessageList({ messages, perspective }: { messages: ListMessage[]; perspective: "player" | "team" }) {
  return (
    <ol className="space-y-4" aria-label="Verlauf">
      {messages.map((m) => {
        if (m.kind === "SYSTEM") {
          return (
            <li key={m.id} className="text-center">
              <span className="nv-mono !text-[0.7rem] whitespace-pre-line">
                {m.body} · {formatDayTime(m.createdAt)}
              </span>
            </li>
          );
        }
        const own = perspective === "player" ? m.kind === "PLAYER" : m.kind === "TEAM" || m.kind === "INTERNAL";
        return (
          <li key={m.id} className={cn("flex", own ? "justify-end" : "justify-start")}>
            <article
              className={cn(
                "max-w-[min(42rem,92%)] rounded-2xl border px-4 py-3",
                m.kind === "INTERNAL" ? "border-dashed border-[color:var(--tone-warn)] bg-[color:var(--tone-warn-bg)]" : own ? "border-red-line bg-red-soft" : "border-line bg-card",
              )}
            >
              <header className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted mb-1.5">
                <span className="font-semibold text-fg text-sm">{m.authorName}</span>
                {m.kind === "TEAM" && <span className="nv-pill nv-pill-red !text-[0.65rem] !py-0">Team</span>}
                {m.kind === "INTERNAL" && (
                  <span className="nv-pill nv-tone-warn !text-[0.65rem] !py-0">
                    <LockSimple size={10} aria-hidden /> Interne Notiz
                  </span>
                )}
                {m.source === "DISCORD" && (
                  <span className="inline-flex items-center gap-1" title="In Discord geschrieben">
                    <DiscordLogo size={12} aria-hidden /> Discord
                  </span>
                )}
                <time dateTime={m.createdAt.toISOString()}>{formatDayTime(m.createdAt)}</time>
                {perspective === "team" && m.kind === "TEAM" && m.deliveryStatus && m.deliveryStatus !== "NOT_SENT" && <DeliveryBadge status={m.deliveryStatus} />}
              </header>
              <div className="text-sm text-fg-2 break-words">
                <DiscordMarkdown text={m.body} />
              </div>
              {m.attachments.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {m.attachments.map((a) =>
                    a.kind === "IMAGE" ? (
                      <li key={a.id}>
                        <a href={`/api/uploads/${a.id}`} target="_blank" rel="noopener">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={`/api/uploads/${a.id}`} alt={a.fileName ?? "Anhang"} className="h-24 w-24 object-cover rounded-lg border border-line" loading="lazy" />
                        </a>
                      </li>
                    ) : (
                      <li key={a.id}>
                        <a href={a.url ?? "#"} target="_blank" rel="noopener noreferrer nofollow" className="nv-pill nv-tone-info !normal-case">
                          <LinkSimple size={12} aria-hidden /> {a.provider ?? "Link"}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </article>
          </li>
        );
      })}
    </ol>
  );
}
