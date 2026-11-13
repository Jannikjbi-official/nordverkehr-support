import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requirePlayer } from "@/lib/auth/session";
import { getSettings } from "@/lib/settings";
import { ACTIVE_TICKET_STATUSES } from "@/lib/tickets/status";
import { CATEGORY_KEYS } from "@/lib/tickets/categories";
import { Container, Notice, PageHero } from "@/components/ui";
import { TicketForm } from "@/components/tickets/TicketForm";

export const metadata: Metadata = { title: "Ticket erstellen" };

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { user } = await requirePlayer("/tickets/neu");
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const settings = await getSettings();
  const [open, team] = await Promise.all([
    db.ticket.count({ where: { creatorId: user.id, status: { in: ACTIVE_TICKET_STATUSES } } }),
    db.user.findMany({ where: { teamLevel: { not: "NONE" }, NOT: { id: user.id } }, select: { id: true, globalName: true, username: true }, orderBy: { globalName: "asc" }, take: 100 }),
  ]);
  const limitReached = open >= settings["tickets.maxOpen"];
  const initialCategory = CATEGORY_KEYS.includes(str("kategorie")) ? str("kategorie") : "";

  return (
    <>
      <PageHero label="Support // Neues Ticket" title="Was ist" emphasis="los?" compact>
        Beschreib dein Anliegen so genau wie möglich – dann geht&apos;s schneller. Antworten vom Team siehst du hier und bekommst sie per DM vom NV Lotse.
      </PageHero>
      <Container>
        {limitReached ? (
          <Notice tone="warn" title="Zu viele offene Tickets">
            Du hast schon {open} offene Tickets (Maximum {settings["tickets.maxOpen"]}). Schreib bitte in ein bestehendes Ticket oder warte, bis eins erledigt ist.
          </Notice>
        ) : (
          <TicketForm
            initialCategory={initialCategory}
            initialSubject={str("betreff").slice(0, 140)}
            team={team.map((t) => ({ id: t.id, name: t.globalName || t.username }))}
            needsConsent={(user.consentVersion ?? 0) < settings["privacy.version"]}
          />
        )}
      </Container>
    </>
  );
}
