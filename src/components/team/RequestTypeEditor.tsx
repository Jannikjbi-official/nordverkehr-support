"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash } from "@phosphor-icons/react/ssr";
import { saveRequestTypeAction } from "@/app/actions/admin";
import { FIELD_TYPES, type FieldDef, type Outcome } from "@/lib/requests/model";

type Level = "SUPPORT" | "MODERATION" | "LEITUNG";

export interface TypeDraft {
  id?: string;
  slug: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  active: boolean;
  visibleFrom: Level;
  decideFrom: Level;
  fourEyes: boolean;
  allowedWhenBanned: boolean;
  requireHonesty: boolean;
  singleOpen: boolean;
  needsSanction: boolean;
  cooldownDays: number;
  cooldownByBanType: Record<string, number>;
  fields: FieldDef[];
  outcomes: Outcome[];
}

const LEVELS: { value: Level; label: string }[] = [
  { value: "SUPPORT", label: "Support" },
  { value: "MODERATION", label: "Moderation" },
  { value: "LEITUNG", label: "Leitung" },
];

export function RequestTypeEditor({ initial, icons }: { initial: TypeDraft; icons: string[] }) {
  const router = useRouter();
  const [t, setT] = useState<TypeDraft>(initial);
  const [cooldowns, setCooldowns] = useState(Object.entries(initial.cooldownByBanType).map(([k, v]) => ({ k, v })));
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof TypeDraft>(k: K, v: TypeDraft[K]) => setT((s) => ({ ...s, [k]: v }));
  const setField = (i: number, patch: Partial<FieldDef>) => set("fields", t.fields.map((f, k) => (k === i ? { ...f, ...patch } : f)));
  const move = (i: number, d: -1 | 1) => {
    const f = [...t.fields];
    const j = i + d;
    if (j < 0 || j >= f.length) return;
    [f[i], f[j]] = [f[j], f[i]];
    set("fields", f);
  };
  const check = (k: keyof TypeDraft, label: string, help?: string) => (
    <label className="flex items-start gap-3 cursor-pointer">
      <input type="checkbox" className="nv-check mt-0.5" checked={t[k] as boolean} onChange={(e) => set(k, e.target.checked as never)} />
      <span>
        <span className="text-sm font-medium">{label}</span>
        {help && <span className="block nv-help">{help}</span>}
      </span>
    </label>
  );

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveRequestTypeAction({ ...t, cooldownByBanType: Object.fromEntries(cooldowns.filter((c) => c.k.trim()).map((c) => [c.k.trim(), Number(c.v) || 0])) });
          if (!r.ok) return setMsg({ tone: "err", text: r.error });
          setMsg({ tone: "ok", text: "Gespeichert." });
          if (!t.id) router.replace(`/team/admin/antragsarten/${r.data!.id}`);
          else router.refresh();
        });
      }}
    >
      <fieldset className="nv-card p-5 grid gap-4 sm:grid-cols-2">
        <legend className="nv-mono px-1">Grunddaten</legend>
        <label>
          <span className="nv-field-label">Titel</span>
          <input className="nv-input mt-1" value={t.title} onChange={(e) => set("title", e.target.value)} maxLength={80} />
        </label>
        <label>
          <span className="nv-field-label">Slug (URL)</span>
          <input className="nv-input mt-1 font-mono" value={t.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} maxLength={40} />
        </label>
        <label className="sm:col-span-2">
          <span className="nv-field-label">Beschreibung</span>
          <input className="nv-input mt-1" value={t.description} onChange={(e) => set("description", e.target.value)} maxLength={400} />
        </label>
        <label>
          <span className="nv-field-label">Icon</span>
          <select className="nv-input mt-1" value={t.icon} onChange={(e) => set("icon", e.target.value)}>
            {icons.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="nv-field-label">Reihenfolge</span>
          <input type="number" className="nv-input mt-1" value={t.order} onChange={(e) => set("order", Number(e.target.value))} />
        </label>
      </fieldset>

      <fieldset className="nv-card p-5 grid gap-4 sm:grid-cols-2">
        <legend className="nv-mono px-1">Rechte &amp; Ablauf</legend>
        <label>
          <span className="nv-field-label">Sichtbar ab</span>
          <select className="nv-input mt-1" value={t.visibleFrom} onChange={(e) => set("visibleFrom", e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="nv-field-label">Entscheiden ab</span>
          <select className="nv-input mt-1" value={t.decideFrom} onChange={(e) => set("decideFrom", e.target.value as Level)}>
            {LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2">
          {check("active", "Aktiv", "Spieler können diese Art stellen.")}
          {check("fourEyes", "Vier-Augen-Prinzip", "Entscheidung braucht die Zustimmung einer zweiten Person.")}
          {check("allowedWhenBanned", "Auch für vom Discord Gebannte", "Typisch nur für den Entbannungsantrag.")}
          {check("requireHonesty", "Ehrlichkeits-Bestätigung (Pflicht)")}
          {check("singleOpen", "Nur ein offener Antrag gleichzeitig")}
          {check("needsSanction", "Bezieht sich auf eine Strafe", "Nutzt die Felder ban_ref (Ban-ID/Datum) und ban_type (Bannart) – für Zuordnung und Sperrfristen.")}
        </div>
      </fieldset>

      <fieldset className="nv-card p-5 space-y-3">
        <legend className="nv-mono px-1">Sperrfrist nach Ablehnung</legend>
        <label className="block max-w-xs">
          <span className="nv-field-label">Standard (Tage, 0 = keine)</span>
          <input type="number" min={0} className="nv-input mt-1" value={t.cooldownDays} onChange={(e) => set("cooldownDays", Number(e.target.value))} />
        </label>
        <p className="nv-field-label">Je Bannart (Wert aus dem Feld ban_type)</p>
        {cooldowns.map((c, i) => (
          <div key={i} className="flex gap-2">
            <input className="nv-input" placeholder="z. B. Permanenter Bann" value={c.k} onChange={(e) => setCooldowns(cooldowns.map((x, k) => (k === i ? { ...x, k: e.target.value } : x)))} />
            <input type="number" min={0} className="nv-input max-w-28" value={c.v} onChange={(e) => setCooldowns(cooldowns.map((x, k) => (k === i ? { ...x, v: Number(e.target.value) } : x)))} />
            <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" aria-label="Entfernen" onClick={() => setCooldowns(cooldowns.filter((_, k) => k !== i))}>
              <Trash size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => setCooldowns([...cooldowns, { k: "", v: 30 }])}>
          <Plus size={14} aria-hidden /> Bannart
        </button>
      </fieldset>

      <fieldset className="nv-card p-5 space-y-3">
        <legend className="nv-mono px-1">Formularfelder</legend>
        {t.fields.map((f, i) => (
          <div key={i} className="rounded-xl border border-line p-3 grid gap-2 sm:grid-cols-[1fr_1fr_160px_auto] items-end">
            <label>
              <span className="nv-field-label">Bezeichnung</span>
              <input className="nv-input mt-1" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            </label>
            <label>
              <span className="nv-field-label">Key</span>
              <input className="nv-input mt-1 font-mono text-sm" value={f.key} onChange={(e) => setField(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} />
            </label>
            <label>
              <span className="nv-field-label">Typ</span>
              <select className="nv-input mt-1" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldDef["type"] })}>
                {FIELD_TYPES.map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-1">
              <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" aria-label="Nach oben" onClick={() => move(i, -1)}>
                <ArrowUp size={14} aria-hidden />
              </button>
              <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" aria-label="Nach unten" onClick={() => move(i, 1)}>
                <ArrowDown size={14} aria-hidden />
              </button>
              <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" aria-label="Feld entfernen" onClick={() => set("fields", t.fields.filter((_, k) => k !== i))}>
                <Trash size={14} aria-hidden />
              </button>
            </div>
            <label className="sm:col-span-2">
              <span className="nv-field-label">Hilfetext</span>
              <input className="nv-input mt-1" value={f.help ?? ""} onChange={(e) => setField(i, { help: e.target.value || undefined })} />
            </label>
            {f.type === "select" && (
              <label className="sm:col-span-2">
                <span className="nv-field-label">Optionen (eine pro Zeile)</span>
                <textarea className="nv-input mt-1 min-h-20" value={(f.options ?? []).join("\n")} onChange={(e) => setField(i, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} />
              </label>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="nv-check" checked={!!f.required} onChange={(e) => setField(i, { required: e.target.checked })} /> Pflicht
            </label>
          </div>
        ))}
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => set("fields", [...t.fields, { key: `feld_${t.fields.length + 1}`, label: "Neues Feld", type: "text" }])}>
          <Plus size={14} aria-hidden /> Feld
        </button>
      </fieldset>

      <fieldset className="nv-card p-5 space-y-3">
        <legend className="nv-mono px-1">Mögliche Ergebnisse</legend>
        {t.outcomes.map((o, i) => (
          <div key={i} className="flex flex-wrap gap-2 items-end">
            <label>
              <span className="nv-field-label">Bezeichnung</span>
              <input className="nv-input mt-1" value={o.label} onChange={(e) => set("outcomes", t.outcomes.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
            </label>
            <label>
              <span className="nv-field-label">Key</span>
              <input className="nv-input mt-1 font-mono text-sm" value={o.key} onChange={(e) => set("outcomes", t.outcomes.map((x, k) => (k === i ? { ...x, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") } : x)))} />
            </label>
            <label>
              <span className="nv-field-label">Einordnung</span>
              <select className="nv-input mt-1" value={o.category} onChange={(e) => set("outcomes", t.outcomes.map((x, k) => (k === i ? { ...x, category: e.target.value as Outcome["category"] } : x)))}>
                <option value="ACCEPTED">angenommen</option>
                <option value="PARTIAL">teilweise</option>
                <option value="REJECTED">abgelehnt (startet Sperrfrist)</option>
              </select>
            </label>
            <button type="button" className="nv-btn nv-btn-quiet nv-btn-sm" aria-label="Ergebnis entfernen" onClick={() => set("outcomes", t.outcomes.filter((_, k) => k !== i))}>
              <Trash size={14} aria-hidden />
            </button>
          </div>
        ))}
        <button type="button" className="nv-btn nv-btn-ghost nv-btn-sm" onClick={() => set("outcomes", [...t.outcomes, { key: `ergebnis_${t.outcomes.length + 1}`, label: "Neues Ergebnis", category: "PARTIAL" }])}>
          <Plus size={14} aria-hidden /> Ergebnis
        </button>
      </fieldset>

      <div className="flex items-center gap-3">
        <button type="submit" className="nv-btn nv-btn-primary" disabled={pending}>
          Speichern
        </button>
        {msg && (
          <p className={msg.tone === "ok" ? "text-sm text-muted" : "nv-error"} role="status">
            {msg.text}
          </p>
        )}
      </div>
    </form>
  );
}
