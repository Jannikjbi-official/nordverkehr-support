import {
  Bug,
  BookOpen,
  Briefcase,
  ChatCircleDots,
  Checks,
  Coins,
  Compass,
  FileText,
  Flag,
  Gavel,
  Headset,
  IdentificationCard,
  Lifebuoy,
  Megaphone,
  Plug,
  Scales,
  ShoppingCartSimple,
  Skull,
  UserCircle,
  Wrench,
} from "@phosphor-icons/react/ssr";
import type { Icon } from "@phosphor-icons/react";

const ICONS: Record<string, Icon> = {
  compass: Compass,
  checks: Checks,
  plug: Plug,
  headset: Headset,
  scales: Scales,
  briefcase: Briefcase,
  gavel: Gavel,
  user: UserCircle,
  wrench: Wrench,
  megaphone: Megaphone,
  bug: Bug,
  book: BookOpen,
  chat: ChatCircleDots,
  identification: IdentificationCard,
  skull: Skull,
  coins: Coins,
  flag: Flag,
  file: FileText,
  lifebuoy: Lifebuoy,
  shop: ShoppingCartSimple,
};

export const ICON_KEYS = Object.keys(ICONS);

export function NvIcon({ name, size = 22, className }: { name: string; size?: number; className?: string }) {
  const I = ICONS[name] ?? Lifebuoy;
  return <I size={size} weight="duotone" className={className} aria-hidden />;
}

export function IconTile({ name, className }: { name: string; className?: string }) {
  return (
    <div
      className={`h-12 w-12 shrink-0 rounded-xl grid place-items-center text-red-text border border-red-line bg-red-soft ${className ?? ""}`}
      style={{ boxShadow: "0 0 24px rgba(196,30,30,0.18)" }}
    >
      <NvIcon name={name} />
    </div>
  );
}
