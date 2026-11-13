import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth/session";
import { PLACEHOLDERS } from "@/lib/messages/placeholders";
import { TICKET_CATEGORIES } from "@/lib/tickets/categories";
import { TemplateEditor } from "@/components/team/TemplateEditor";

export const metadata: Metadata = { title: "Nachrichtenbausteine" };

export default async function TemplatesPage() {
  const { access } = await requireTeam();
  const [templates, types] = await Promise.all([db.messageTemplate.findMany({ orderBy: [{ scope: "asc" }, { order: "asc" }] }), db.requestType.findMany({ orderBy: { order: "asc" }, select: { slug: true, title: true } })]);
  return (
    <div>
      <p className="nv-label">Team // Bausteine</p>
      <h1 className="nv-headline text-4xl mt-3">
        Nachrichten<em>bausteine</em>
      </h1>
      <p className="text-muted mt-2">Textbausteine für Tickets und Anträge. Platzhalter werden beim Einfügen ersetzt.{!access.isMod && " Bearbeiten darf Moderation/Leitung."}</p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {PLACEHOLDERS.map((p) => (
          <span key={p.key} className="nv-pill nv-tone-muted !normal-case" title={p.label}>
            {`{${p.key}}`}
          </span>
        ))}
      </div>
      <div className="mt-6">
        <TemplateEditor
          canEdit={access.isMod}
          templates={templates.map((t) => ({ id: t.id, title: t.title, body: t.body, scope: t.scope as "ticket", ticketCategory: t.ticketCategory, requestTypeSlug: t.requestTypeSlug }))}
          categories={TICKET_CATEGORIES.map((c) => ({ key: c.key, label: c.label }))}
          requestTypes={types.map((t) => ({ key: t.slug, label: t.title }))}
        />
      </div>
    </div>
  );
}
