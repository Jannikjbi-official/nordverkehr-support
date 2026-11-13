"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteTemplateAction, saveTemplateAction } from "@/app/actions/team-content";
import { DiscordMarkdown } from "@/components/DiscordMarkdown";
import { confirmDialog } from "@/components/ConfirmDialog";
import { renderTemplate } from "@/lib/messages/placeholders";

interface Tpl {
  id?: string;
  title: string;
  body: string;
  scope: "ticket" | "request" | "all";
  ticketCategory: string | null;
  requestTypeSlug: string | null;
}

const PREVIEW_VARS = {
  name: "Finn",
  discord_tag: "@finn_hh",
  ticket_id: "NVS-2026-0042",
  antrag_id: "NVA-2026-0007",
  kategorie: "Technik & Verbindung",
  antragsart: "Entbannungsantrag",
  teammitglied: "Jonas",
  sperrfrist: "1. Dezember 2026",
  status_link: "https://support.nordverkehr.xyz/…",
  hilfe_link: "https://support.nordverkehr.xyz",
  regelwerk_link: "https://nordverkehr.xyz/regeln",
  discord_link: "https://discord.gg/…",
};

export function TemplateEditor({ templates, categories, requestTypes, canEdit }: { templates: Tpl[]; categories: { key: string; label: string }[]; requestTypes: { key: string; label: string }[]; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Tpl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scopeLabel = (t: Tpl) =>
    t.scope === "all" ? "Überall" : t.scope === "ticket" ? `Tickets${t.ticketCategory ? ` · ${categories.find((c) => c.key === t.ticketCategory)?.label}` : ""}` : `Anträge${t.requestTypeSlug ? ` · ${requestTypes.find((c) => c.key === t.requestTypeSlug)?.label}` : ""}`;

  return (
    <div className="space-y-4">
      {canEdit && !edit && (
        <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" onClick={() => setEdit({ title: "", body: "", scope: "ticket", ticketCategory: null, requestTypeSlug: null })}>
          Neuer Baustein
        </button>
      )}
      {edit && (
        <form
          className="nv-card p-5 grid gap-3 lg:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveTemplateAction(edit);
              if (!r.ok) return setError(r.error);
              setEdit(null);
              router.refresh();
            });
          }}
        >
          <div className="space-y-3">
            <label className="block">
              <span className="nv-field-label">Titel</span>
              <input className="nv-input mt-1" value={edit.title} maxLength={80} onChange={(e) => setEdit({ ...edit, title: e.target.value })} required />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label>
                <span className="nv-field-label">Für</span>
                <select className="nv-input mt-1" value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value as Tpl["scope"] })}>
                  <option value="ticket">Tickets</option>
                  <option value="request">Anträge</option>
                  <option value="all">Überall</option>
                </select>
              </label>
              {edit.scope === "ticket" && (
                <label>
                  <span className="nv-field-label">Kategorie</span>
                  <select className="nv-input mt-1" value={edit.ticketCategory ?? ""} onChange={(e) => setEdit({ ...edit, ticketCategory: e.target.value || null })}>
                    <option value="">Alle</option>
                    {categories.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {edit.scope === "request" && (
                <label>
                  <span className="nv-field-label">Antragsart</span>
                  <select className="nv-input mt-1" value={edit.requestTypeSlug ?? ""} onChange={(e) => setEdit({ ...edit, requestTypeSlug: e.target.value || null })}>
                    <option value="">Alle</option>
                    {requestTypes.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <label className="block">
              <span className="nv-field-label">Text</span>
              <textarea className="nv-input mt-1 min-h-48" value={edit.body} maxLength={4000} onChange={(e) => setEdit({ ...edit, body: e.target.value })} required />
            </label>
            {error && <p className="nv-error">{error}</p>}
            <div className="flex gap-2">
              <button type="submit" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending}>
                Speichern
              </button>
              <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => setEdit(null)}>
                Abbrechen
              </button>
            </div>
          </div>
          <div>
            <p className="nv-mono mb-2">Vorschau (Beispielwerte)</p>
            <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm">
              <DiscordMarkdown text={renderTemplate(edit.body, PREVIEW_VARS).text} />
            </div>
          </div>
        </form>
      )}
      <ul className="grid gap-3 md:grid-cols-2">
        {templates.map((t) => (
          <li key={t.id} className="nv-card p-4">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t.title}</p>
                <p className="nv-mono !text-[0.65rem] mt-0.5">{scopeLabel(t)}</p>
              </div>
              {canEdit && (
                <span className="flex gap-1">
                  <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" onClick={() => setEdit(t)}>
                    Bearbeiten
                  </button>
                  <button
                    type="button"
                    className="nv-btn nv-btn-quiet nv-btn-sm"
                    onClick={async () => {
                      if (await confirmDialog({ title: `„${t.title}“ löschen?`, confirmLabel: "Löschen", tone: "danger" })) start(async () => void (await deleteTemplateAction(t.id!), router.refresh()));
                    }}
                  >
                    Löschen
                  </button>
                </span>
              )}
            </div>
            <p className="text-sm text-muted mt-2 line-clamp-4 whitespace-pre-line">{t.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
