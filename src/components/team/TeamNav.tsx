"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Article,
  ChartBar,
  ChatsCircle,
  ClockCounterClockwise,
  FileText,
  Gear,
  House,
  ListChecks,
  Pulse,
  Ticket,
  Users,
} from "@phosphor-icons/react/ssr";
import type { TeamLevel } from "@prisma/client";

const ITEMS = [
  { href: "/team", label: "Übersicht", icon: House, exact: true },
  { href: "/team/tickets", label: "Tickets", icon: Ticket },
  { href: "/team/antraege", label: "Anträge", icon: FileText },
  { href: "/team/spieler", label: "Spieler", icon: Users },
  { href: "/team/artikel", label: "Hilfe-Artikel", icon: Article },
  { href: "/team/status", label: "Statusseite", icon: Pulse },
  { href: "/team/bausteine", label: "Nachrichtenbausteine", icon: ChatsCircle },
  { href: "/team/statistiken", label: "Statistiken", icon: ChartBar },
];
const LEAD = [
  { href: "/team/admin/antragsarten", label: "Antragsarten", icon: ListChecks },
  { href: "/team/audit", label: "Audit-Log", icon: ClockCounterClockwise },
  { href: "/team/admin", label: "Einstellungen & Discord", icon: Gear, exact: true },
];

export function TeamNav({ level, levelLabel }: { level: TeamLevel; levelLabel: string }) {
  const path = usePathname();
  const matches = (href: string, exact?: boolean) => (exact ? path === href : path === href || path.startsWith(href + "/"));
  const all = [...ITEMS, ...LEAD];
  const isActive = (href: string, exact?: boolean) => matches(href, exact) && !all.some((o) => o.href.length > href.length && matches(o.href));

  const link = (i: (typeof ITEMS)[number]) => {
    const active = isActive(i.href, "exact" in i ? (i as { exact?: boolean }).exact : false);
    return (
      <Link
        key={i.href}
        href={i.href}
        aria-current={active ? "page" : undefined}
        className={`flex items-center gap-2.5 shrink-0 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-red-soft text-fg font-medium" : "text-muted hover:text-fg hover:bg-card-hover"}`}
      >
        <i.icon size={17} weight={active ? "fill" : "regular"} className={active ? "text-red-text" : ""} aria-hidden />
        {i.label}
      </Link>
    );
  };

  return (
    <nav aria-label="Team-Bereich" className="lg:sticky lg:top-28 self-start">
      <p className="nv-label hidden lg:flex mb-1">Team-Bereich</p>
      <p className="nv-mono hidden lg:block mb-4 !text-[0.65rem]">Stufe: {levelLabel}</p>
      <div className="flex gap-1 overflow-x-auto pb-2 lg:pb-0 lg:flex-col nv-scroll-x -mx-4 px-4 lg:mx-0 lg:px-0">
        {ITEMS.map(link)}
        {level === "LEITUNG" && (
          <>
            <p className="nv-mono hidden lg:block mt-5 mb-1 px-3">Leitung</p>
            {LEAD.map(link)}
          </>
        )}
      </div>
    </nav>
  );
}
