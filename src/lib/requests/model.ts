/**
 * Antragsarten: Felder, Ergebnisse, Status, Sperrfristen – rein (auch im Browser nutzbar).
 */
import { z } from "zod";
import type { OutcomeCategory, RequestStatus } from "@prisma/client";
import type { FieldDef } from "@/lib/tickets/categories";
import { isAllowedClipUrl, CLIP_HOSTS_LABEL } from "@/lib/uploads/links";

export type { FieldDef };

export interface Outcome {
  key: string;
  label: string;
  category: OutcomeCategory;
}

export const FIELD_TYPES: { value: FieldDef["type"]; label: string }[] = [
  { value: "text", label: "Kurzer Text" },
  { value: "textarea", label: "Langer Text" },
  { value: "date", label: "Datum" },
  { value: "time", label: "Uhrzeit" },
  { value: "url", label: "Clip-Link" },
  { value: "select", label: "Auswahl" },
  { value: "checkbox", label: "Häkchen" },
];

export const FieldDefSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, "Key: klein, a–z, 0–9, _"),
  label: z.string().min(2).max(120),
  type: z.enum(["text", "textarea", "date", "time", "url", "select", "checkbox"]),
  required: z.boolean().optional(),
  help: z.string().max(300).optional(),
  placeholder: z.string().max(120).optional(),
  options: z.array(z.string().min(1).max(80)).max(20).optional(),
  max: z.number().int().min(10).max(5000).optional(),
});

export const OutcomeSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
  label: z.string().min(2).max(60),
  category: z.enum(["ACCEPTED", "PARTIAL", "REJECTED"]),
});

export function parseFields(json: unknown): FieldDef[] {
  const r = z.array(FieldDefSchema).safeParse(json);
  return r.success ? (r.data as FieldDef[]) : [];
}

export function parseOutcomes(json: unknown): Outcome[] {
  const r = z.array(OutcomeSchema).safeParse(json);
  return r.success ? r.data : [];
}

export function parseCooldowns(json: unknown): Record<string, number> {
  const r = z.record(z.string(), z.number().int().min(0).max(3650)).safeParse(json);
  return r.success ? r.data : {};
}

/** zod-Schema für die Antworten eines Antrags */
export function answersSchema(fields: FieldDef[]) {
  const shape: Record<string, z.ZodType<unknown>> = {};
  for (const f of fields) {
    if (f.type === "checkbox") {
      shape[f.key] = f.required ? z.literal(true, { message: `${f.label} muss bestätigt werden.` }) : z.boolean().optional().default(false);
      continue;
    }
    let s = z.string().trim().max(f.max ?? 3000);
    if (f.type === "url") s = s.refine((v) => !v || isAllowedClipUrl(v), `Nur Links von ${CLIP_HOSTS_LABEL}.`) as unknown as typeof s;
    if (f.type === "date") s = s.refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Bitte ein Datum wählen.") as unknown as typeof s;
    if (f.type === "select" && f.options?.length) s = s.refine((v) => !v || f.options!.includes(v), "Bitte eine Option wählen.") as unknown as typeof s;
    shape[f.key] = f.required ? s.min(1, `${f.label} fehlt.`) : s.optional().default("");
  }
  return z.object(shape);
}

export function displayAnswers(fields: FieldDef[], answers: unknown): { key: string; label: string; value: string }[] {
  const v = (answers && typeof answers === "object" ? answers : {}) as Record<string, unknown>;
  return fields
    .map((f) => ({ key: f.key, label: f.label, value: v[f.key] === true ? "Ja" : v[f.key] === false || v[f.key] == null ? "" : String(v[f.key]) }))
    .filter((a) => a.value !== "");
}

export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  SUBMITTED: "Eingereicht",
  IN_REVIEW: "In Prüfung",
  QUESTION: "Rückfrage an dich",
  DECIDED: "Entschieden",
  ARCHIVED: "Archiviert",
  WITHDRAWN: "Zurückgezogen",
};
export const REQUEST_STATUS_LABEL_TEAM: Record<RequestStatus, string> = { ...REQUEST_STATUS_LABEL, QUESTION: "Rückfrage an Spieler" };

export const REQUEST_STATUS_TONE: Record<RequestStatus, "accent" | "info" | "warn" | "success" | "muted"> = {
  SUBMITTED: "accent",
  IN_REVIEW: "info",
  QUESTION: "warn",
  DECIDED: "success",
  ARCHIVED: "muted",
  WITHDRAWN: "muted",
};

export const OUTCOME_TONE: Record<OutcomeCategory, "success" | "warn" | "danger"> = { ACCEPTED: "success", PARTIAL: "warn", REJECTED: "danger" };
export const OUTCOME_CATEGORY_LABEL: Record<OutcomeCategory, string> = { ACCEPTED: "angenommen", PARTIAL: "teilweise", REJECTED: "abgelehnt" };

// ─── Wer darf einen Antrag stellen? ───────────────────────────

export interface EligibilityInput {
  type: { active: boolean; allowedWhenBanned: boolean; singleOpen: boolean };
  banned: boolean;
  openCount: number;
  cooldownUntil: Date | null;
  now?: Date;
}

export type Eligibility = { ok: true } | { ok: false; reason: string; until?: Date };

export function checkEligibility(i: EligibilityInput): Eligibility {
  const now = i.now ?? new Date();
  if (!i.type.active) return { ok: false, reason: "Diese Antragsart ist gerade nicht verfügbar." };
  if (i.banned && !i.type.allowedWhenBanned) return { ok: false, reason: "Solange du vom Discord gebannt bist, ist nur der Entbannungsantrag möglich." };
  if (i.type.singleOpen && i.openCount > 0) return { ok: false, reason: "Du hast schon einen offenen Antrag dieser Art. Warte bitte die Entscheidung ab." };
  if (i.cooldownUntil && i.cooldownUntil > now) {
    return { ok: false, reason: `Nach der letzten Ablehnung gilt eine Sperrfrist bis ${new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(i.cooldownUntil)}.`, until: i.cooldownUntil };
  }
  return { ok: true };
}

/** Sperrfrist nach Ablehnung: je Bannart, sonst Standard der Antragsart (Tage, 0 = keine) */
export function cooldownDaysFor(type: { cooldownDays: number; cooldownByBanType?: unknown }, banType: string | null | undefined): number {
  const map = parseCooldowns(type.cooldownByBanType);
  if (banType && banType in map) return map[banType];
  return type.cooldownDays;
}
