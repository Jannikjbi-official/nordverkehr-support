/**
 * Ticket-Kategorien mit ihren Pflichtfeldern. Rein (läuft auch im Browser):
 * Web-Formular, Discord-Modal und Server-Validierung nutzen dieselben Definitionen.
 */
import { z } from "zod";
import type { Sensitivity } from "@prisma/client";
import { isAllowedClipUrl, CLIP_HOSTS_LABEL } from "@/lib/uploads/links";

export type FieldType = "text" | "textarea" | "date" | "time" | "url" | "select" | "checkbox";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  help?: string;
  placeholder?: string;
  options?: string[];
  max?: number;
  /** Nur anzeigen, wenn dieses Checkbox-Feld gesetzt ist */
  showIf?: string;
}

export interface TicketCategory {
  key: string;
  label: string;
  short: string;
  description: string;
  icon: string;
  /** Wer sieht diese Tickets standardmäßig? */
  sensitivity: Sensitivity;
  fields: FieldDef[];
  /** Felder fürs Discord-Modal (max. 4 neben der Beschreibung) */
  discordFields: { key: string; label: string; style: 1 | 2; required: boolean; placeholder?: string; max?: number }[];
  /** Hilfe-Kategorie für Artikelvorschläge */
  helpCategory?: string;
}

export const TICKET_CATEGORIES: TicketCategory[] = [
  {
    key: "technik",
    label: "Technik & Verbindung",
    short: "Technik",
    description: "FiveM startet nicht, Verbindungsabbrüche, TeamSpeak/SaltyChat, Performance.",
    icon: "wrench",
    sensitivity: "NORMAL",
    helpCategory: "technik-verbindung",
    fields: [
      {
        key: "area",
        label: "Worum geht es?",
        type: "select",
        required: true,
        options: ["FiveM startet nicht", "Verbindung / Timeout", "TeamSpeak / SaltyChat", "Performance / FPS", "Sonstiges"],
      },
      { key: "error", label: "Fehlermeldung", type: "textarea", help: "Am besten den genauen Text abtippen oder einen Screenshot anhängen.", max: 2000 },
      { key: "since", label: "Seit wann?", type: "text", placeholder: "z. B. seit dem letzten Update", max: 120 },
    ],
    discordFields: [
      { key: "area", label: "Worum geht es? (Start, Verbindung, Voice …)", style: 1, required: true, max: 100 },
      { key: "error", label: "Fehlermeldung (falls vorhanden)", style: 2, required: false, max: 1000 },
    ],
  },
  {
    key: "beschwerde",
    label: "Spielerbeschwerde",
    short: "Beschwerde",
    description: "Regelverstoß von anderen Spielern – oder Beschwerde über ein Teammitglied.",
    icon: "megaphone",
    sensitivity: "NORMAL",
    helpCategory: "regelwerk",
    fields: [
      { key: "date", label: "Datum", type: "date", required: true },
      { key: "time", label: "Uhrzeit (ungefähr)", type: "time", required: true },
      { key: "involved", label: "Beteiligte Personen", type: "textarea", required: true, help: "Ingame-Namen, wenn bekannt auch Discord-Namen.", max: 1000 },
      { key: "clip", label: "Clip-Link", type: "url", help: `Erlaubt: ${CLIP_HOSTS_LABEL}. Ohne Clip können wir meist wenig machen.`, max: 300 },
      { key: "noClip", label: "Ich habe keinen Clip", type: "checkbox" },
      { key: "noClipReason", label: "Warum gibt es keinen Clip?", type: "text", showIf: "noClip", max: 300 },
      {
        key: "teamComplaint",
        label: "Die Beschwerde betrifft ein Teammitglied",
        type: "checkbox",
        help: "Dann sieht nur die Moderation/Leitung dein Ticket – das betroffene Teammitglied nie. Läuft nur hier im Portal, nicht in Discord.",
      },
    ],
    discordFields: [
      { key: "date", label: "Datum (TT.MM.JJJJ)", style: 1, required: true, max: 20 },
      { key: "time", label: "Uhrzeit (ungefähr)", style: 1, required: true, max: 20 },
      { key: "involved", label: "Beteiligte Personen", style: 2, required: true, max: 1000 },
      { key: "clip", label: `Clip-Link (${CLIP_HOSTS_LABEL})`, style: 1, required: false, max: 300 },
    ],
  },
  {
    key: "bug",
    label: "Bug melden",
    short: "Bug",
    description: "Etwas funktioniert im Spiel nicht so, wie es soll.",
    icon: "bug",
    sensitivity: "NORMAL",
    helpCategory: "technik-verbindung",
    fields: [
      { key: "where", label: "Wo ist es passiert?", type: "text", required: true, placeholder: "Ort, Menü, Job …", max: 200 },
      { key: "steps", label: "Wie kann man es nachstellen?", type: "textarea", required: true, max: 2000 },
      { key: "expected", label: "Was hättest du erwartet?", type: "text", max: 300 },
      { key: "clip", label: "Clip-Link (optional)", type: "url", help: `Erlaubt: ${CLIP_HOSTS_LABEL}.`, max: 300 },
    ],
    discordFields: [
      { key: "where", label: "Wo ist es passiert?", style: 1, required: true, max: 200 },
      { key: "steps", label: "Wie kann man es nachstellen?", style: 2, required: true, max: 1000 },
    ],
  },
  {
    key: "regelwerk",
    label: "Frage zum Regelwerk",
    short: "Regelwerk",
    description: "Du bist unsicher, ob etwas erlaubt ist? Frag lieber vorher.",
    icon: "book",
    sensitivity: "NORMAL",
    helpCategory: "regelwerk",
    fields: [{ key: "rule", label: "Um welche Regel geht es?", type: "text", placeholder: "z. B. 2.3 Meta-Gaming", max: 120 }],
    discordFields: [{ key: "rule", label: "Um welche Regel geht es? (optional)", style: 1, required: false, max: 120 }],
  },
  {
    key: "shop",
    label: "Shop & Zahlung",
    short: "Shop",
    description: "Kauf im Tebex-Shop nicht angekommen oder Fragen zu einer Zahlung.",
    icon: "shop",
    // Zahlungsdaten: nur Moderation/Leitung
    sensitivity: "MOD_ONLY",
    helpCategory: "shop-zahlungen",
    fields: [
      { key: "transaction", label: "Transaktions-ID (Tebex)", type: "text", required: true, help: "Steht in der Kaufbestätigung von Tebex per E-Mail (beginnt meist mit „tbx-“).", placeholder: "tbx-…", max: 80 },
      { key: "item", label: "Gekaufter Artikel", type: "text", required: true, max: 160 },
      { key: "date", label: "Kaufdatum", type: "date", required: true },
      { key: "ingame", label: "Ingame-Name", type: "text", required: true, help: "Der Charakter, der den Kauf bekommen soll.", max: 80 },
    ],
    discordFields: [
      { key: "transaction", label: "Transaktions-ID (Tebex, tbx-…)", style: 1, required: true, max: 80 },
      { key: "item", label: "Gekaufter Artikel", style: 1, required: true, max: 160 },
      { key: "ingame", label: "Ingame-Name", style: 1, required: true, max: 80 },
    ],
  },
  {
    key: "sonstiges",
    label: "Sonstiges",
    short: "Sonstiges",
    description: "Alles, was nirgends richtig reinpasst.",
    icon: "chat",
    sensitivity: "NORMAL",
    fields: [],
    discordFields: [],
  },
];

export const CATEGORY_KEYS = TICKET_CATEGORIES.map((c) => c.key) as [string, ...string[]];

export function getCategory(key: string): TicketCategory | undefined {
  return TICKET_CATEGORIES.find((c) => c.key === key);
}

export const categoryLabel = (key: string) => getCategory(key)?.label ?? key;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function fieldSchema(f: FieldDef, lenient: boolean): z.ZodType<unknown> {
  if (f.type === "checkbox") return z.boolean().optional().default(false);
  let s = z.string().trim().max(f.max ?? 2000);
  if (!lenient) {
    if (f.type === "date") s = s.refine((v) => !v || DATE_RE.test(v), "Bitte ein Datum wählen.") as unknown as typeof s;
    if (f.type === "time") s = s.refine((v) => !v || TIME_RE.test(v), "Bitte eine Uhrzeit wählen.") as unknown as typeof s;
    if (f.type === "select" && f.options) s = s.refine((v) => !v || f.options!.includes(v), "Bitte eine Option wählen.") as unknown as typeof s;
  }
  if (f.type === "url") s = s.refine((v) => !v || isAllowedClipUrl(v), `Nur Links von ${CLIP_HOSTS_LABEL}.`) as unknown as typeof s;
  if (f.required && !f.showIf) return s.min(1, `${f.label} fehlt.`);
  return s.optional().default("");
}

/**
 * zod-Schema für die Kategorie-Felder. `lenient` = Discord-Modal (Freitext für
 * Datum/Uhrzeit, keine Auswahllisten).
 */
export function fieldsSchema(category: TicketCategory, opts: { lenient?: boolean } = {}) {
  const fields = opts.lenient ? category.fields.filter((f) => category.discordFields.some((d) => d.key === f.key)) : category.fields;
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const f of fields) shape[f.key] = fieldSchema(f, !!opts.lenient);
  let schema: z.ZodType<Record<string, unknown>> = z.object(shape);
  if (category.key === "beschwerde" && !opts.lenient) {
    schema = schema.refine(
      (v) => !!v.clip || (v.noClip === true && String(v.noClipReason ?? "").trim().length >= 5),
      { message: "Bitte gib einen Clip-Link an – oder erkläre kurz, warum es keinen gibt.", path: ["clip"] },
    );
  }
  return schema;
}

/** Felder für die Anzeige (Label + Wert), leere weglassen */
export function displayFields(categoryKey: string, fields: unknown): { label: string; value: string }[] {
  const cat = getCategory(categoryKey);
  const values = (fields && typeof fields === "object" ? fields : {}) as Record<string, unknown>;
  const out: { label: string; value: string }[] = [];
  for (const f of cat?.fields ?? []) {
    const v = values[f.key];
    if (v === undefined || v === null || v === "" || v === false) continue;
    out.push({ label: f.label, value: v === true ? "Ja" : String(v) });
  }
  return out;
}
