import { describe, expect, it } from "vitest";
import { answersSchema, checkEligibility, cooldownDaysFor, displayAnswers } from "@/lib/requests/model";
import { REQUEST_TYPES } from "@/lib/setup/seed-data";

const NOW = new Date("2026-11-13T12:00:00Z");
const type = { active: true, allowedWhenBanned: false, singleOpen: true };

describe("Sperrfristen & Zugang zu Anträgen", () => {
  it("Gebannte dürfen nur Antragsarten mit allowedWhenBanned stellen", () => {
    expect(checkEligibility({ type, banned: true, openCount: 0, cooldownUntil: null, now: NOW }).ok).toBe(false);
    expect(checkEligibility({ type: { ...type, allowedWhenBanned: true }, banned: true, openCount: 0, cooldownUntil: null, now: NOW }).ok).toBe(true);
  });

  it("nur ein offener Antrag gleichzeitig", () => {
    const r = checkEligibility({ type, banned: false, openCount: 1, cooldownUntil: null, now: NOW });
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("offenen Antrag") });
  });

  it("Sperrfrist nach Ablehnung greift bis zum Datum", () => {
    const until = new Date("2026-11-20T12:00:00Z");
    expect(checkEligibility({ type, banned: false, openCount: 0, cooldownUntil: until, now: NOW })).toEqual({ ok: false, reason: expect.stringContaining("Sperrfrist"), until });
    expect(checkEligibility({ type, banned: false, openCount: 0, cooldownUntil: until, now: new Date("2026-11-21T00:00:00Z") }).ok).toBe(true);
  });

  it("Sperrfrist pro Bannart einstellbar, sonst Standard", () => {
    const unban = REQUEST_TYPES.find((t) => t.slug === "entbannung")!;
    expect(cooldownDaysFor(unban, "Permanenter Bann")).toBe(60);
    expect(cooldownDaysFor(unban, "Cheating / Modding")).toBe(180);
    expect(cooldownDaysFor(unban, "unbekannt")).toBe(unban.cooldownDays);
    expect(cooldownDaysFor(unban, null)).toBe(unban.cooldownDays);
  });

  it("deaktivierte Antragsarten gehen nicht", () => {
    expect(checkEligibility({ type: { ...type, active: false }, banned: false, openCount: 0, cooldownUntil: null, now: NOW }).ok).toBe(false);
  });
});

describe("Seed-Antragsarten", () => {
  it("Entbannung und Einspruch: Vier-Augen, nur Moderation/Leitung, Ehrlichkeit Pflicht", () => {
    for (const slug of ["entbannung", "einspruch"]) {
      const t = REQUEST_TYPES.find((x) => x.slug === slug)!;
      expect(t.fourEyes).toBe(true);
      expect(t.visibleFrom).toBe("MODERATION");
      expect(t.decideFrom).toBe("MODERATION");
      expect(t.requireHonesty).toBe(true);
    }
  });

  it("nur die Entbannung ist für Gebannte offen", () => {
    expect(REQUEST_TYPES.filter((t) => t.allowedWhenBanned).map((t) => t.slug)).toEqual(["entbannung"]);
  });

  it("Rückerstattung nur mit Beweis, nur Moderation/Leitung", () => {
    const t = REQUEST_TYPES.find((x) => x.slug === "rueckerstattung")!;
    expect(t.fields.find((f) => f.key === "evidence")?.required).toBe(true);
    expect(t.visibleFrom).toBe("MODERATION");
  });

  it("Entbannungs-Ergebnisse wie gefordert", () => {
    const t = REQUEST_TYPES.find((x) => x.slug === "entbannung")!;
    expect(t.outcomes.map((o) => o.label)).toEqual(["Abgelehnt", "Bann verkürzt", "Bann aufgehoben", "Aufgehoben auf Bewährung"]);
  });

  it("Pflichtfelder werden geprüft, Clip-Links nur von erlaubten Seiten", () => {
    const t = REQUEST_TYPES.find((x) => x.slug === "entbannung")!;
    const schema = answersSchema(t.fields);
    expect(schema.safeParse({}).success).toBe(false);
    const ok = { ingame_name: "Tjark", ban_ref: "BAN-1", ban_type: "Temporärer Bann", ban_reason: "x", own_view: "y", why_lift: "z", future: "w" };
    expect(schema.safeParse(ok).success).toBe(true);
    expect(schema.safeParse({ ...ok, evidence: "https://evil.example/clip" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, ban_type: "Gibt es nicht" }).success).toBe(false);
  });

  it("Anzeige lässt leere Antworten weg", () => {
    expect(displayAnswers([{ key: "a", label: "A", type: "text" }, { key: "b", label: "B", type: "text" }], { a: "x", b: "" })).toEqual([{ key: "a", label: "A", value: "x" }]);
  });
});
