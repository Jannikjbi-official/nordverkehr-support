"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Markdown } from "@/components/Markdown";
import { deleteArticleAction, saveArticleAction } from "@/app/actions/team-content";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Select } from "@/components/Select";

interface Initial {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  body: string;
  categoryId: string;
  tags: string[];
  relatedIds: string[];
  status: "DRAFT" | "PUBLISHED";
}

export function ArticleEditor({ initial, categories, articles, canDelete }: { initial: Initial; categories: { id: string; title: string }[]; articles: { id: string; title: string }[]; canDelete: boolean }) {
  const router = useRouter();
  const [a, setA] = useState(initial);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Initial>(k: K, v: Initial[K]) => setA((s) => ({ ...s, [k]: v }));

  const save = (status: Initial["status"]) =>
    start(async () => {
      const r = await saveArticleAction({ ...a, status, tags: tags.split(",").map((t) => t.trim()).filter(Boolean) });
      if (!r.ok) return setMsg({ tone: "err", text: r.error });
      setMsg({ tone: "ok", text: status === "PUBLISHED" ? "Veröffentlicht." : "Als Entwurf gespeichert." });
      setA((s) => ({ ...s, status }));
      if (!a.id) router.replace(`/team/artikel/${r.data!.id}`);
      else router.refresh();
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4 min-w-0">
        <label className="block">
          <span className="nv-field-label">Titel</span>
          <input className="nv-input mt-1" value={a.title} maxLength={140} onChange={(e) => set("title", e.target.value)} />
        </label>
        <label className="block">
          <span className="nv-field-label">Kurztext (erscheint in Listen und Suche)</span>
          <input className="nv-input mt-1" value={a.summary} maxLength={300} onChange={(e) => set("summary", e.target.value)} />
        </label>
        <div role="tablist" aria-label="Editor" className="flex gap-1">
          <button type="button" role="tab" aria-selected={tab === "edit"} className={`nv-btn nv-btn-sm ${tab === "edit" ? "nv-btn-primary" : "nv-btn-ghost"}`} onClick={() => setTab("edit")}>
            Bearbeiten
          </button>
          <button type="button" role="tab" aria-selected={tab === "preview"} className={`nv-btn nv-btn-sm ${tab === "preview" ? "nv-btn-primary" : "nv-btn-ghost"}`} onClick={() => setTab("preview")}>
            Vorschau
          </button>
        </div>
        {tab === "edit" ? (
          <div>
            <label htmlFor="md" className="sr-only">
              Inhalt (Markdown)
            </label>
            <textarea id="md" className="nv-input min-h-[28rem] font-mono text-sm" value={a.body} maxLength={30000} onChange={(e) => set("body", e.target.value)} />
            <p className="nv-help mt-1">
              Markdown: <code>## Überschrift</code>, <code>**fett**</code>, <code>*kursiv*</code>, <code>- Liste</code>, <code>1. Liste</code>, <code>[Link](https://…)</code>, <code>![Bild](https://…)</code>, <code>&gt; Hinweis</code>, Tabellen mit <code>|</code>. Bilder nur per https-Link.
            </p>
          </div>
        ) : (
          <div className="nv-card p-6">
            <h2 className="nv-headline text-3xl">{a.title || "Ohne Titel"}</h2>
            <p className="text-muted mt-2">{a.summary}</p>
            <div className="nv-divider my-6" />
            <Markdown source={a.body} />
          </div>
        )}
      </div>
      <aside className="space-y-4">
        <div className="nv-card p-4 space-y-3">
          <p className="text-sm">
            Status: {a.status === "PUBLISHED" ? <span className="nv-pill nv-tone-success">veröffentlicht</span> : <span className="nv-pill nv-tone-muted">Entwurf</span>}
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="nv-btn nv-btn-primary nv-btn-sm" disabled={pending} onClick={() => save("PUBLISHED")}>
              Veröffentlichen
            </button>
            <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" disabled={pending} onClick={() => save("DRAFT")}>
              Als Entwurf
            </button>
          </div>
          {msg && <p className={msg.tone === "ok" ? "text-xs text-muted" : "nv-error"} role="status">{msg.text}</p>}
        </div>
        <div className="nv-card p-4 space-y-3">
          <div>
            <label htmlFor="article-category" className="nv-field-label">
              Kategorie
            </label>
            <Select id="article-category" className="mt-1" value={a.categoryId} onChange={(v) => set("categoryId", v)} options={categories.map((c) => ({ value: c.id, label: c.title }))} />
          </div>
          <label className="block">
            <span className="nv-field-label">Slug (URL)</span>
            <input className="nv-input mt-1 font-mono text-sm" value={a.slug} placeholder="wird aus dem Titel erzeugt" onChange={(e) => set("slug", e.target.value)} />
          </label>
          <label className="block">
            <span className="nv-field-label">Tags (Komma, auch Tippfehler/Synonyme)</span>
            <input className="nv-input mt-1" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="salty, ts3, voice" />
          </label>
          <fieldset>
            <legend className="nv-field-label">Verwandte Artikel</legend>
            <div className="mt-2 max-h-48 overflow-auto space-y-1">
              {articles.map((x) => (
                <label key={x.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="nv-check" checked={a.relatedIds.includes(x.id)} onChange={(e) => set("relatedIds", e.target.checked ? [...a.relatedIds, x.id].slice(0, 6) : a.relatedIds.filter((r) => r !== x.id))} />
                  {x.title}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {a.id && canDelete && (
          <button
            type="button"
            className="nv-btn nv-btn-danger nv-btn-sm"
            disabled={pending}
            onClick={async () => {
              if (!(await confirmDialog({ title: "Artikel löschen?", body: "Das lässt sich nicht rückgängig machen. Als Entwurf speichern blendet ihn nur aus.", confirmLabel: "Löschen", tone: "danger" }))) return;
              start(async () => {
                const r = await deleteArticleAction(a.id!);
                if (r.ok) router.push("/team/artikel");
                else setMsg({ tone: "err", text: r.error });
              });
            }}
          >
            Löschen
          </button>
        )}
      </aside>
    </div>
  );
}
