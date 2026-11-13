import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { requireLead } from "@/lib/auth/session";
import { parseCooldowns, parseFields, parseOutcomes } from "@/lib/requests/model";
import { ICON_KEYS } from "@/components/icons";
import { RequestTypeEditor } from "@/components/team/RequestTypeEditor";

export const metadata: Metadata = { title: "Antragsart bearbeiten" };

export default async function RequestTypeEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireLead();
  const isNew = id === "neu";
  const t = isNew ? null : await db.requestType.findUnique({ where: { id } });
  if (!isNew && !t) notFound();
  return (
    <div>
      <Link href="/team/admin/antragsarten" className="nv-btn nv-btn-quiet nv-btn-sm">
        <ArrowLeft size={14} aria-hidden /> Alle Antragsarten
      </Link>
      <h1 className="nv-headline text-3xl mt-4">{t ? t.title : "Neue Antragsart"}</h1>
      <div className="mt-6">
        <RequestTypeEditor
          icons={ICON_KEYS}
          initial={
            t
              ? {
                  id: t.id,
                  slug: t.slug,
                  title: t.title,
                  description: t.description,
                  icon: t.icon,
                  order: t.order,
                  active: t.active,
                  visibleFrom: t.visibleFrom === "NONE" ? "SUPPORT" : t.visibleFrom,
                  decideFrom: t.decideFrom === "NONE" ? "MODERATION" : t.decideFrom,
                  fourEyes: t.fourEyes,
                  allowedWhenBanned: t.allowedWhenBanned,
                  requireHonesty: t.requireHonesty,
                  singleOpen: t.singleOpen,
                  needsSanction: t.needsSanction,
                  cooldownDays: t.cooldownDays,
                  cooldownByBanType: parseCooldowns(t.cooldownByBanType),
                  fields: parseFields(t.fields),
                  outcomes: parseOutcomes(t.outcomes),
                }
              : {
                  slug: "",
                  title: "",
                  description: "",
                  icon: "file",
                  order: 50,
                  active: false,
                  visibleFrom: "SUPPORT",
                  decideFrom: "MODERATION",
                  fourEyes: false,
                  allowedWhenBanned: false,
                  requireHonesty: false,
                  singleOpen: true,
                  needsSanction: false,
                  cooldownDays: 0,
                  cooldownByBanType: {},
                  fields: [{ key: "text", label: "Dein Antrag", type: "textarea", required: true }],
                  outcomes: [
                    { key: "angenommen", label: "Angenommen", category: "ACCEPTED" },
                    { key: "abgelehnt", label: "Abgelehnt", category: "REJECTED" },
                  ],
                }
          }
        />
      </div>
    </div>
  );
}
