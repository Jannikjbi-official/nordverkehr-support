import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildIndex, editDistance, missKey, search } from "@/lib/help/search";
import { SEED_ARTICLES } from "@/lib/setup/articles";
import { HELP_CATEGORIES } from "@/lib/setup/seed-data";
import { checkSpam, looksLikeBot, similarity } from "@/lib/spam";
import { clipProvider, isAllowedClipUrl } from "@/lib/uploads/links";
import { fieldsSchema, getCategory } from "@/lib/tickets/categories";
import { autoCloseAction } from "@/lib/tickets/autoclose";
import { renderTranscript } from "@/lib/tickets/transcript";
import { Markdown, extractToc } from "@/components/Markdown";
import { minimize, stripRecommendations } from "@/lib/ai/sanitize";
import { normalizePublicId } from "@/lib/ids";

const index = buildIndex(
  SEED_ARTICLES.map((a) => ({ id: a.slug, slug: a.slug, title: a.title, summary: a.summary, body: a.body, tags: a.tags, categorySlug: a.category, categoryTitle: HELP_CATEGORIES.find((c) => c.slug === a.category)!.title })),
);
const top = (q: string) => search(index, q, 3).map((h) => h.doc.slug);

describe("Suche mit Tippfehler-Toleranz", () => {
  it("findet exakt und zusammengeschrieben/getrennt", () => {
    expect(top("SaltyChat verbindet nicht")[0]).toBe("saltychat-verbindet-nicht");
    expect(top("salty chat")).toContain("saltychat-verbindet-nicht");
  });

  it("verzeiht Tippfehler", () => {
    expect(top("whitlist")).toContain("wie-komme-ich-auf-die-whitelist");
    expect(top("metagamming")).toContain("was-ist-metagaming");
    expect(top("entbanung")).toContain("wie-stelle-ich-einen-entbannungsantrag");
    expect(editDistance("teamspeek", "teamspeak")).toBe(1);
  });

  it("Umlaute und Groß/Klein egal; Unsinn findet nichts", () => {
    expect(missKey("  Löschung  ")).toBe("loeschung");
    expect(search(index, "qqqxxyz", 3)).toEqual([]);
  });

  it("Seed: 10–15 Artikel, alle Kategorien belegt, verwandte Artikel existieren", () => {
    expect(SEED_ARTICLES.length).toBeGreaterThanOrEqual(10);
    expect(SEED_ARTICLES.length).toBeLessThanOrEqual(15);
    for (const c of HELP_CATEGORIES) expect(SEED_ARTICLES.some((a) => a.category === c.slug)).toBe(true);
    const slugs = new Set(SEED_ARTICLES.map((a) => a.slug));
    for (const a of SEED_ARTICLES) for (const r of a.related) expect(slugs.has(r)).toBe(true);
  });
});

describe("Markdown ist sicher", () => {
  it("keine javascript:-Links, kein HTML", () => {
    const html = renderToStaticMarkup(Markdown({ source: "[klick](javascript:alert(1)) <script>alert(1)</script> ![x](http://evil/x.png)" }));
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("http://evil");
  });

  it("Inhaltsverzeichnis aus Überschriften", () => {
    expect(extractToc("## Erste Hilfe\ntext\n### Unterpunkt\n## Erste Hilfe")).toEqual([
      { id: "erste-hilfe", text: "Erste Hilfe", level: 2 },
      { id: "unterpunkt", text: "Unterpunkt", level: 3 },
      { id: "erste-hilfe-2", text: "Erste Hilfe", level: 2 },
    ]);
  });
});

describe("Spam-Schutz", () => {
  it("erkennt Copy-Paste-Spam (eigene Wiederholung und Wellen)", () => {
    const text = "Ich wurde zu Unrecht gebannt, bitte sofort entbannen, das ist eine Frechheit!";
    expect(checkSpam(text, { recentOwn: [text] }).ok).toBe(false);
    expect(checkSpam(text, { recentOthers: [text, text + " !"] }).ok).toBe(false);
    expect(checkSpam(text, { recentOwn: ["Ganz anderes Thema mit dem Auto am Hafen heute Abend."] }).ok).toBe(true);
    expect(similarity("a b c d e", "a b c d e")).toBe(1);
  });

  it("Zeichensalat und Link-Flut", () => {
    expect(checkSpam("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa").ok).toBe(false);
    expect(checkSpam(Array(10).fill("https://x.de").join(" ")).ok).toBe(false);
  });

  it("Honeypot und Mindest-Ausfüllzeit", () => {
    expect(looksLikeBot({ honeypot: "http://spam" })).toBe(true);
    expect(looksLikeBot({ startedAt: 1000 }, 2000)).toBe(true);
    expect(looksLikeBot({ startedAt: 1000 }, 10_000)).toBe(false);
  });
});

describe("Anhänge & Pflichtfelder", () => {
  it("Clip-Links nur YouTube, Twitch, Medal (https)", () => {
    expect(clipProvider("https://www.youtube.com/watch?v=x")).toBe("YouTube");
    expect(clipProvider("https://clips.twitch.tv/abc")).toBe("Twitch");
    expect(clipProvider("https://medal.tv/clips/1")).toBe("Medal");
    expect(isAllowedClipUrl("http://youtube.com/x")).toBe(false);
    expect(isAllowedClipUrl("https://youtube.com.evil.de/x")).toBe(false);
    expect(isAllowedClipUrl("https://user:pw@youtube.com/x")).toBe(false);
  });

  it("Spielerbeschwerde: Datum, Uhrzeit, Beteiligte Pflicht; Clip oder Begründung", () => {
    const s = fieldsSchema(getCategory("beschwerde")!);
    const base = { date: "2026-11-10", time: "21:30", involved: "Kalle" };
    expect(s.safeParse(base).success).toBe(false);
    expect(s.safeParse({ ...base, clip: "https://medal.tv/clips/1" }).success).toBe(true);
    expect(s.safeParse({ ...base, noClip: true, noClipReason: "War im Talk" }).success).toBe(true);
    expect(s.safeParse({ ...base, clip: "https://medal.tv/clips/1", date: "" }).success).toBe(false);
  });

  it("Discord-Modal ist toleranter bei Datum/Uhrzeit", () => {
    const s = fieldsSchema(getCategory("beschwerde")!, { lenient: true });
    expect(s.safeParse({ date: "10.11.", time: "abends", involved: "Kalle" }).success).toBe(true);
  });
});

describe("Auto-Close mit Erinnerung", () => {
  const s = { autoCloseDays: 5, reminderHours: 24, resolvedCloseDays: 3 };
  const D = 86_400_000;
  const now = new Date("2026-11-13T12:00:00Z");
  const t = (o: object) => ({ status: "WAITING_PLAYER" as const, waitingSince: null, autoCloseWarnedAt: null, resolvedAt: null, ...o });

  it("erst Erinnerung, dann schließen – nie ohne Vorwarnung", () => {
    expect(autoCloseAction(t({ waitingSince: new Date(now.getTime() - 3 * D) }), s, now)).toBeNull();
    expect(autoCloseAction(t({ waitingSince: new Date(now.getTime() - 4.5 * D) }), s, now)).toBe("remind");
    expect(autoCloseAction(t({ waitingSince: new Date(now.getTime() - 10 * D) }), s, now)).toBe("remind");
    expect(autoCloseAction(t({ waitingSince: new Date(now.getTime() - 10 * D), autoCloseWarnedAt: new Date(now.getTime() - 2 * 3600_000) }), s, now)).toBeNull();
    expect(autoCloseAction(t({ waitingSince: new Date(now.getTime() - 10 * D), autoCloseWarnedAt: new Date(now.getTime() - 25 * 3600_000) }), s, now)).toBe("close");
  });

  it("gelöste Tickets werden nach Frist geschlossen", () => {
    expect(autoCloseAction({ status: "RESOLVED", waitingSince: null, autoCloseWarnedAt: null, resolvedAt: new Date(now.getTime() - 4 * D) }, s, now)).toBe("closeResolved");
    expect(autoCloseAction({ status: "IN_PROGRESS", waitingSince: null, autoCloseWarnedAt: null, resolvedAt: null }, s, now)).toBeNull();
  });
});

describe("Transkript", () => {
  it("enthält keine internen Notizen", () => {
    const md = renderTranscript({
      publicId: "NVS-2026-0001",
      subject: "Test",
      category: "technik",
      fields: { area: "Sonstiges" },
      status: "CLOSED",
      createdAt: new Date(),
      closedAt: new Date(),
      messages: [
        { authorName: "Finn", kind: "PLAYER", body: "Hilfe", source: "WEB", createdAt: new Date(), links: [] },
        { authorName: "Jonas", kind: "INTERNAL", body: "GEHEIM", source: "WEB", createdAt: new Date(), links: [] },
        { authorName: "Jonas", kind: "TEAM", body: "Erledigt", source: "DISCORD", createdAt: new Date(), links: [] },
      ],
    });
    expect(md).toContain("Hilfe");
    expect(md).toContain("Erledigt");
    expect(md).toContain("via Discord");
    expect(md).not.toContain("GEHEIM");
  });
});

describe("KI: Datensparsamkeit und keine Bewertungen", () => {
  it("entfernt Discord-IDs, Erwähnungen und Link-Pfade", () => {
    const out = minimize("Hi <@123456789012345678> 123456789012345678 https://medal.tv/clips/secret", 500);
    expect(out).not.toContain("123456789012345678");
    expect(out).not.toContain("secret");
    expect(out).toContain("[Link: medal.tv]");
  });

  it("filtert Empfehlungen aus Antrags-Zusammenfassungen", () => {
    const out = stripRecommendations("- Antrag auf Entbannung\n- Ich empfehle die Annahme\n- Der Bann sollte aufgehoben werden\n- Clip liegt vor");
    expect(out).toBe("- Antrag auf Entbannung\n- Clip liegt vor");
  });
});

describe("IDs", () => {
  it("normalisiert Ticket-IDs für /ticket claim", () => {
    expect(normalizePublicId("nvs-2026-12", "NVS", 2026)).toBe("NVS-2026-0012");
    expect(normalizePublicId("12", "NVS", 2026)).toBe("NVS-2026-0012");
    expect(normalizePublicId("abc", "NVS", 2026)).toBeNull();
  });
});
