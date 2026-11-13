import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react/ssr";
import { db } from "@/lib/db";
import { getCurrentAccess } from "@/lib/auth/session";
import { teamCanSeeTicket } from "@/lib/perms";
import { viewerOf } from "@/lib/tickets/service";
import { Container } from "@/components/ui";
import { Markdown } from "@/components/Markdown";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Transkript", robots: { index: false } };

/** Transkript – für den Ersteller und das Team (mit Sichtrecht) */
export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, access } = await getCurrentAccess();
  if (!user || !access) redirect(`/login?callbackUrl=/tickets/${id}/transkript`);
  const t = await db.ticket.findUnique({ where: { id } });
  if (!t || !t.transcript) notFound();
  const isOwner = t.creatorId === user.id;
  if (!isOwner && !teamCanSeeTicket(viewerOf(user, access.teamLevel), t)) notFound();
  return (
    <Container className="pt-32 sm:pt-36">
      <div className="flex flex-wrap gap-2">
        <Link href={isOwner ? `/tickets/${t.id}` : `/team/tickets/${t.id}`} className="nv-btn nv-btn-quiet nv-btn-sm">
          <ArrowLeft size={14} aria-hidden /> Zum Ticket
        </Link>
        <a href={`/api/me/transcript/${t.id}`} className="nv-btn nv-btn-ghost nv-btn-sm">
          <DownloadSimple size={14} aria-hidden /> Als Datei
        </a>
      </div>
      <div className="mt-8 max-w-3xl nv-card p-6 sm:p-8">
        <Markdown source={t.transcript} />
      </div>
    </Container>
  );
}
