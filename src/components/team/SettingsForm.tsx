"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "@/app/actions/admin";

type Values = Record<string, string | number | boolean>;

export function SettingsForm({ settings, labels }: { settings: Values; labels: Record<string, { label: string; help?: string; group: string }> }) {
  const [values, setValues] = useState<Values>(settings);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(Object.values(labels).map((l) => l.group))];

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveSettingsAction(values);
          setMsg(r.ok ? { tone: "ok", text: "Gespeichert." } : { tone: "err", text: r.error });
        });
      }}
    >
      {groups.map((g) => (
        <fieldset key={g} className="nv-card p-5">
          <legend className="nv-mono px-1">{g}</legend>
          <div className="grid gap-4 sm:grid-cols-2 mt-2">
            {Object.entries(labels)
              .filter(([, l]) => l.group === g)
              .map(([key, l]) => {
                const v = values[key];
                const id = `s-${key.replace(/\./g, "-")}`;
                if (typeof v === "boolean") {
                  return (
                    <label key={key} className="flex items-start gap-3 cursor-pointer sm:col-span-2">
                      <input id={id} type="checkbox" className="nv-check mt-0.5" checked={v} onChange={(e) => setValues({ ...values, [key]: e.target.checked })} />
                      <span>
                        <span className="text-sm font-medium">{l.label}</span>
                        {l.help && <span className="block nv-help">{l.help}</span>}
                      </span>
                    </label>
                  );
                }
                return (
                  <label key={key} htmlFor={id} className="block">
                    <span className="nv-field-label">{l.label}</span>
                    <input
                      id={id}
                      className="nv-input mt-1"
                      type={typeof v === "number" ? "number" : "text"}
                      step={typeof v === "number" ? "any" : undefined}
                      value={String(v)}
                      onChange={(e) => setValues({ ...values, [key]: typeof v === "number" ? Number(e.target.value) : e.target.value })}
                    />
                    {l.help && <span className="nv-help block mt-1">{l.help}</span>}
                  </label>
                );
              })}
          </div>
        </fieldset>
      ))}
      <button type="submit" className="nv-btn nv-btn-primary" disabled={pending}>
        Speichern
      </button>
      {msg && (
        <p className={msg.tone === "ok" ? "text-sm text-muted" : "nv-error"} role="status">
          {msg.text}
        </p>
      )}
    </form>
  );
}
