/**
 * Platzhalter in Nachrichtenbausteinen. Rein, ohne Server-Abhängigkeiten –
 * wird auch im Browser für die Live-Vorschau verwendet.
 */
export const PLACEHOLDERS = [
  { key: "name", label: "Anzeigename des Spielers" },
  { key: "discord_tag", label: "Discord-Benutzername (@name)" },
  { key: "ticket_id", label: "Ticket-ID (NVS-…)" },
  { key: "antrag_id", label: "Antrags-ID (NVA-…)" },
  { key: "kategorie", label: "Ticket-Kategorie" },
  { key: "antragsart", label: "Antragsart" },
  { key: "teammitglied", label: "Dein Name" },
  { key: "sperrfrist", label: "Neuer Antrag möglich ab (Datum)" },
  { key: "status_link", label: "Link zum Ticket/Antrag" },
  { key: "hilfe_link", label: "Link zum Hilfe-Center" },
  { key: "regelwerk_link", label: "Link zum Regelwerk" },
  { key: "discord_link", label: "Einladung zum Discord" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];
export type TemplateVars = Partial<Record<PlaceholderKey, string | null | undefined>>;

const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key));
const PATTERN = /\{([a-z_]+)\}/g;

export interface RenderResult {
  text: string;
  /** Bekannte Platzhalter ohne Wert – bleiben sichtbar stehen. */
  missing: PlaceholderKey[];
}

export function renderTemplate(text: string, vars: TemplateVars): RenderResult {
  const missing = new Set<PlaceholderKey>();
  const out = text.replace(PATTERN, (match, key: string) => {
    if (!KNOWN.has(key)) return match;
    const value = vars[key as PlaceholderKey];
    if (value === undefined || value === null || String(value).trim() === "") {
      missing.add(key as PlaceholderKey);
      return match;
    }
    return String(value);
  });
  return { text: out, missing: [...missing] };
}

export function findPlaceholders(text: string): string[] {
  return [...new Set([...text.matchAll(PATTERN)].map((m) => m[1]).filter((k) => KNOWN.has(k)))];
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date(d));
}
