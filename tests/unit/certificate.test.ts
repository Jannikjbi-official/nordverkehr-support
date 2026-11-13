import { describe, expect, it } from "vitest";
import { buildNameChangePdf, codeMatches, hasCertificate, normalizeCode, verificationCode } from "@/lib/requests/certificate";

const KEY = "test-secret-1234567890";

describe("Bescheid: Prüfcode", () => {
  it("ist fest je Antrag, Format XXXXX-XXXXX, ohne verwechselbare Zeichen", () => {
    const a = verificationCode("req1", KEY);
    expect(a).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect(verificationCode("req1", KEY)).toBe(a);
    expect(verificationCode("req2", KEY)).not.toBe(a);
    expect(verificationCode("req1", "anderes-geheimnis-123")).not.toBe(a);
  });

  it("akzeptiert Eingaben in Kleinbuchstaben, ohne Bindestrich, mit Leerzeichen", () => {
    const code = verificationCode("req1", KEY);
    expect(codeMatches("req1", code.toLowerCase().replace("-", " "), KEY)).toBe(true);
    expect(codeMatches("req2", code, KEY)).toBe(false);
    expect(codeMatches("req1", "ABC", KEY)).toBe(false);
    expect(normalizeCode("abcde fghij")).toBe("ABCDE-FGHIJ");
  });
});

describe("Bescheid: wann es einen gibt", () => {
  const base = { status: "DECIDED", outcomeCategory: "ACCEPTED", decidedAt: new Date(), type: { slug: "namensaenderung" } };
  it("nur für angenommene Namensänderungen", () => {
    expect(hasCertificate(base)).toBe(true);
    expect(hasCertificate({ ...base, status: "ARCHIVED" })).toBe(true);
    expect(hasCertificate({ ...base, outcomeCategory: "REJECTED" })).toBe(false);
    expect(hasCertificate({ ...base, status: "IN_REVIEW" })).toBe(false);
    expect(hasCertificate({ ...base, type: { slug: "entbannung" } })).toBe(false);
  });
});

describe("Bescheid: PDF", () => {
  it("baut ein PDF – auch mit Umlauten und Zeichen, die die Schrift nicht kann", async () => {
    const pdf = await buildNameChangePdf({
      publicId: "NVA-2026-0007",
      submittedAt: new Date("2026-11-10T12:00:00Z"),
      decidedAt: new Date("2026-11-13T12:00:00Z"),
      currentName: "Jürgen Weiß",
      newName: "Jörg Straße 🚗 Ωmega",
      decidedBy: "Hanna",
      approvedBy: "Ole",
      code: "ABCDE-FGHJK",
      verifyUrl: "https://support.example/bescheid/pruefen",
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
