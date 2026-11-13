"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { LockSimple } from "@phosphor-icons/react/ssr";
import type { TicketPriority, TicketStatus } from "@prisma/client";
import { teamStatusAction } from "@/app/actions/team-tickets";
import { PRIORITY_LABEL, PRIORITY_TONE, TICKET_STATUS_LABEL_TEAM, TICKET_STATUS_TONE } from "@/lib/tickets/status";
import { confirmDialog } from "@/components/ConfirmDialog";

export interface KanbanItem {
  id: string;
  publicId: string;
  subject: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  player: string;
  claimedBy: string | null;
  sensitive: boolean;
  tags: string[];
}

const COLUMNS: TicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_PLAYER", "RESOLVED", "CLOSED"];

export function TicketKanban({ items: initial }: { items: KanbanItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [dragging, setDragging] = useState<KanbanItem | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [, start] = useTransition();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  async function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const item = items.find((i) => i.id === e.active.id);
    const to = e.over?.id as TicketStatus | undefined;
    if (!item || !to || item.status === to) return;
    if (to === "CLOSED" && !(await confirmDialog({ title: `${item.publicId} schließen?`, body: "Der Spieler bekommt eine Nachricht mit Bitte um Bewertung, das Transkript wird gespeichert.", confirmLabel: "Schließen" }))) return;
    const prev = items;
    setItems((list) => list.map((i) => (i.id === item.id ? { ...i, status: to } : i)));
    start(async () => {
      const r = await teamStatusAction(item.id, to);
      if (!r.ok) {
        setItems(prev);
        setMessage({ tone: "err", text: r.error });
      } else {
        setMessage({ tone: "ok", text: `${item.publicId}: ${TICKET_STATUS_LABEL_TEAM[to]}` });
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-3">
      <div aria-live="polite">{message && <div className={`rounded-xl border px-4 py-2.5 text-sm ${message.tone === "ok" ? "nv-tone-success" : "nv-tone-danger"}`}>{message.text}</div>}</div>
      <DndContext
        sensors={sensors}
        onDragStart={(e) => setDragging(items.find((i) => i.id === e.active.id) ?? null)}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        accessibility={{ screenReaderInstructions: { draggable: "Leertaste zum Aufnehmen, Pfeiltasten zum Verschieben zwischen Spalten, Leertaste zum Ablegen." } }}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 nv-scroll-x snap-x">
          {COLUMNS.map((s) => (
            <Column key={s} status={s} items={items.filter((i) => i.status === s)} />
          ))}
        </div>
        <DragOverlay>{dragging ? <Card item={dragging} overlay /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({ status, items }: { status: TicketStatus; items: KanbanItem[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={TICKET_STATUS_LABEL_TEAM[status]} className={`snap-start w-72 shrink-0 rounded-2xl border p-3 transition-colors ${isOver ? "border-red-line bg-red-soft" : "border-line bg-card"}`}>
      <header className="flex items-center justify-between px-1 pb-3">
        <h2 className={`text-sm font-semibold nv-tone-${TICKET_STATUS_TONE[status]} !bg-transparent`}>{TICKET_STATUS_LABEL_TEAM[status]}</h2>
        <span className="text-xs text-muted tabular-nums">{items.length}</span>
      </header>
      <ul className="space-y-2 min-h-24">
        {items.map((i) => (
          <DraggableCard key={i.id} item={i} />
        ))}
      </ul>
    </section>
  );
}

function DraggableCard({ item }: { item: KanbanItem }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id });
  return (
    <li ref={setNodeRef} {...attributes} {...listeners} className={isDragging ? "opacity-30" : ""} aria-roledescription="Karte">
      <Card item={item} />
    </li>
  );
}

function Card({ item, overlay }: { item: KanbanItem; overlay?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-3 cursor-grab active:cursor-grabbing ${overlay ? "shadow-[var(--nv-shadow)] rotate-1" : "hover:border-line-strong"}`}>
      <Link href={`/team/tickets/${item.id}`} className="block text-sm font-medium hover:text-red-text" onPointerDown={(e) => e.stopPropagation()}>
        {item.subject}
      </Link>
      <p className="text-xs text-muted mt-0.5">
        <span className="font-mono">{item.publicId}</span> · {item.player}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`nv-pill nv-tone-${PRIORITY_TONE[item.priority]} !text-[0.65rem] !py-0`}>{PRIORITY_LABEL[item.priority]}</span>
        {item.sensitive && (
          <span className="nv-pill nv-tone-danger !text-[0.65rem] !py-0">
            <LockSimple size={10} aria-hidden /> vertraulich
          </span>
        )}
        {item.tags.slice(0, 3).map((t) => (
          <span key={t} className="nv-pill nv-tone-muted !text-[0.65rem] !py-0">
            #{t}
          </span>
        ))}
      </div>
      <p className="text-xs text-muted mt-2">{item.claimedBy ? `📌 ${item.claimedBy}` : "frei"}</p>
    </div>
  );
}
