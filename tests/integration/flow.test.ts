/**
 * Integrationstest gegen eine echte MongoDB (mongodb-memory-server, Replica Set)
 * und eine gefälschte Discord-API. Prüft die Abläufe Ende-zu-Ende über die
 * Services – inkl. der echten Prisma-Filter für Sichtbarkeit.
 *
 *   npm run test:integration
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import type { DiscordApi } from "@/lib/discord/client";

let rs: MongoMemoryReplSet;
type Mods = {
  db: typeof import("@/lib/db").db;
  tickets: typeof import("@/lib/tickets/service");
  requests: typeof import("@/lib/requests/service");
  queries: typeof import("@/lib/team/queries");
  outbox: typeof import("@/lib/discord/outbox-db");
  client: typeof import("@/lib/discord/client");
};
let m: Mods;

// Gefälschte Discord-API: merkt sich alle Aufrufe
const calls: string[] = [];
let nextId = 5000;
const fakeApi: DiscordApi = {
  getMember: async () => null,
  getBan: async () => null,
  openDm: async (u) => (calls.push(`dm:${u}`), `dm-${u}`),
  postMessage: async (ch) => {
    const id = String(nextId++);
    calls.push(`post:${ch}:${id}`);
    return id;
  },
  editMessage: async () => {},
  deleteMessage: async () => {},
};

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  const url = rs.getUri("nordverkehr_support_test");
  Object.assign(process.env, {
    DATABASE_URL: url,
    DISCORD_BOT_TOKEN: "test-token",
    DISCORD_GUILD_ID: "100000000000000000",
    DISCORD_TICKET_CHANNEL_ID: "200000000000000000",
    NEXT_PUBLIC_APP_URL: "https://support.example",
  });
  // Asynchron! execSync würde die Event-Loop blockieren – dann läuft die Log-Pipe von mongod voll und alles hängt.
  await promisify(exec)("npx prisma db push --skip-generate", { env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: "1" }, timeout: 120_000 });
  m = {
    db: (await import("@/lib/db")).db,
    tickets: await import("@/lib/tickets/service"),
    requests: await import("@/lib/requests/service"),
    queries: await import("@/lib/team/queries"),
    outbox: await import("@/lib/discord/outbox-db"),
    client: await import("@/lib/discord/client"),
  };
  m.client.setDiscordApiForTests(fakeApi);
  const { ensureBaseData } = await import("@/lib/setup/base-seed");
  const { seedDemo } = await import("@/lib/setup/demo");
  await ensureBaseData(m.db);
  await seedDemo(m.db);
}, 240_000);

afterAll(async () => {
  await m?.db.$disconnect().catch(() => {});
  await rs?.stop();
});

const user = (username: string) => m.db.user.findFirstOrThrow({ where: { username } });
const viewer = async (username: string) => {
  const u = await user(username);
  return { u, v: m.tickets.viewerOf(u, u.teamLevel) };
};

describe("Sichtbarkeit bei Beschwerden über Teammitglieder (echte Prisma-Filter)", () => {
  it("der beschuldigte Supporter sieht die Beschwerde nicht – auch nicht per Suche", async () => {
    const { v } = await viewer("jonas.support");
    const list = await m.queries.listTeamTickets(v, { status: "alle" });
    expect(list.map((t) => t.subject)).not.toContain("Beschwerde über Supporter");
    expect(list.length).toBeGreaterThan(0);
    const search = await m.queries.listTeamTickets(v, { status: "alle", q: "unfreundlich" });
    expect(search).toHaveLength(0);
  });

  it("Moderation (nicht beschuldigt) und Leitung sehen sie", async () => {
    for (const name of ["hanna.mod", "ole.leitung"]) {
      const { v } = await viewer(name);
      const list = await m.queries.listTeamTickets(v, { status: "alle" });
      expect(list.map((t) => t.subject)).toContain("Beschwerde über Supporter");
    }
  });

  it("direkter Aufruf per ID schlägt für den Beschuldigten fehl", async () => {
    const { v } = await viewer("jonas.support");
    const t = await m.db.ticket.findFirstOrThrow({ where: { subject: "Beschwerde über Supporter" } });
    await expect(m.tickets.loadTicketForTeam(v, t.id)).rejects.toThrow("nicht gefunden");
  });

  it("Moderation trägt einen Beschuldigten nach → dieser verliert sofort den Zugriff", async () => {
    const { u: hanna, v } = await viewer("hanna.mod");
    const kai = await user("kai.mod");
    const t = await m.db.ticket.findFirstOrThrow({ where: { subject: "VDM am Hafen" } });
    await m.tickets.updateTicketMeta({ viewer: v, actor: hanna, ticketId: t.id, accusedUserIds: [kai.id] });
    const { v: kaiV } = await viewer("kai.mod");
    await expect(m.tickets.loadTicketForTeam(kaiV, t.id)).rejects.toThrow();
    const jonas = await viewer("jonas.support");
    await expect(m.tickets.loadTicketForTeam(jonas.v, t.id)).rejects.toThrow(); // jetzt vertraulich → Support raus
  });
});

describe("Vier-Augen-Prinzip (Entbannung)", () => {
  it("Vorschlag der aussprechenden Moderatorin entscheidet nicht – eine andere Person muss zustimmen", async () => {
    const r = await m.db.request.findFirstOrThrow({ where: { type: { slug: "entbannung" } } });
    const hanna = await viewer("hanna.mod");
    const proposal = await m.requests.proposeDecision(hanna.v, hanna.u, r.id, "bewaehrung", "Einsicht gezeigt, auf Bewährung zurück.");
    expect(proposal.decided).toBe(false);
    // Eigener Vorschlag + Aussprechende: nicht bestätigbar
    await expect(m.requests.approveDecision(hanna.v, hanna.u, proposal.decisionId)).rejects.toThrow();
    // Support darf Entbannungen nicht einmal sehen
    const jonas = await viewer("jonas.support");
    await expect(m.requests.approveDecision(jonas.v, jonas.u, proposal.decisionId)).rejects.toThrow();
    expect((await m.db.request.findUniqueOrThrow({ where: { id: r.id } })).status).not.toBe("DECIDED");
    // Zweite Moderation stimmt zu → entschieden
    const kai = await viewer("kai.mod");
    await m.requests.approveDecision(kai.v, kai.u, proposal.decisionId);
    const after = await m.db.request.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("DECIDED");
    expect(after.outcomeLabel).toBe("Aufgehoben auf Bewährung");
    expect(after.decidedById).toBe(hanna.u.id);
    expect(after.approvedById).toBe(kai.u.id);
    const audit = await m.db.auditLog.findFirst({ where: { action: "request.decide", targetId: r.id } });
    expect(audit?.meta).toMatchObject({ fourEyes: true });
  });

  it("auch ohne Vier-Augen-Pflicht entscheidet die aussprechende Person nie allein", async () => {
    await m.db.requestType.update({ where: { slug: "einspruch" }, data: { fourEyes: false } });
    const r = await m.db.request.findFirstOrThrow({ where: { type: { slug: "einspruch" } } }); // Strafe von Kai
    const kai = await viewer("kai.mod");
    const res = await m.requests.proposeDecision(kai.v, kai.u, r.id, "abgelehnt", "Clip zeigt die Reparatur nicht.");
    expect(res.decided).toBe(false);
    await m.db.requestType.update({ where: { slug: "einspruch" }, data: { fourEyes: true } });
  });
});

describe("Gebannte Spieler & Sperrfristen", () => {
  it("Gebannte können nur den Entbannungsantrag stellen – und nur einen offenen", async () => {
    const tjark = await user("tjark99");
    await expect(
      m.requests.submitRequest({ user: tjark, banned: true, typeSlug: "namensaenderung", answers: { current_name: "a", new_name: "b", reason: "c" }, honesty: false }),
    ).rejects.toThrow("Entbannungsantrag");
    const answers = { ingame_name: "Tjark", ban_ref: "BAN-1042", ban_type: "Temporärer Bann", ban_reason: "CL", own_view: "Neue Sicht der Dinge", why_lift: "Einsicht", future: "Besser" };
    const first = await m.requests.submitRequest({ user: tjark, banned: true, typeSlug: "entbannung", answers, honesty: true });
    expect(first.request.issuedByDiscordId).toBe((await user("hanna.mod")).discordId); // über Ban-ID zugeordnet
    await expect(m.requests.submitRequest({ user: tjark, banned: true, typeSlug: "entbannung", answers: { ...answers, own_view: "Noch ein Versuch mit ganz anderem Text" }, honesty: true })).rejects.toThrow("offenen Antrag");
  });

  it("Ehrlichkeits-Bestätigung ist Pflicht", async () => {
    const mia = await user("mia.elbe");
    await expect(
      m.requests.submitRequest({ user: mia, banned: false, typeSlug: "rueckerstattung", answers: { ingame_name: "Mia", date: "2026-11-10", time: "20:00", lost: "5000 $", how: "Bug", evidence: "https://medal.tv/x" }, honesty: false }),
    ).rejects.toThrow("ehrlich");
  });

  it("Ablehnung setzt die Sperrfrist der Antragsart", async () => {
    const mia = await user("mia.elbe");
    const { request } = await m.requests.submitRequest({ user: mia, banned: false, typeSlug: "namensaenderung", answers: { current_name: "Mia Hansen", new_name: "Mia Petersen", reason: "Heirat" }, honesty: false });
    const jonas = await viewer("jonas.support");
    const r = await m.requests.proposeDecision(jonas.v, jonas.u, request.id, "abgelehnt", "Die Heirat ist im RP nicht nachvollziehbar.");
    expect(r.decided).toBe(true);
    const type = await m.db.requestType.findUniqueOrThrow({ where: { slug: "namensaenderung" } });
    const elig = await m.requests.eligibilityFor(mia, type, false);
    expect(elig.ok).toBe(false);
    expect(elig.ok === false && elig.reason).toContain("Sperrfrist");
  });

  it("Angenommene Namensänderung: Bescheid als PDF nur für Antragsteller/Team, Prüfcode gültig", async () => {
    const lena = await m.db.user.create({ data: { discordId: "666666666666666666", username: "lena", globalName: "Lena", discordCreatedAt: new Date(), inGuild: true } });
    const { request } = await m.requests.submitRequest({ user: lena, banned: false, typeSlug: "namensaenderung", answers: { current_name: "Lena Brandt", new_name: "Lena Ahrens", reason: "Heirat im RP mit Tom Ahrens." }, honesty: false });
    const jonas = await viewer("jonas.support");
    const r = await m.requests.proposeDecision(jonas.v, jonas.u, request.id, "angenommen", "Passt, Heirat ist im RP belegt.");
    expect(r.decided).toBe(true);
    const cert = await import("@/lib/requests/certificate-db");
    const { verificationCode } = await import("@/lib/requests/certificate");
    const asPlayer = await cert.certificatePdfFor(request.id, lena, { userId: lena.id, discordId: lena.discordId, teamLevel: "NONE" });
    expect(asPlayer && Buffer.from(asPlayer.pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const mia = await user("mia.elbe");
    expect(await cert.certificatePdfFor(request.id, mia, { userId: mia.id, discordId: mia.discordId, teamLevel: "NONE" })).toBeNull();
    expect(await cert.certificatePdfFor(request.id, jonas.u, jonas.v)).not.toBeNull();
    const msgs = await m.db.requestMessage.findMany({ where: { requestId: request.id, kind: "SYSTEM" } });
    expect(msgs.some((x) => x.body.includes("Rathaus"))).toBe(true);
    const ok = await cert.verifyCertificate(request.publicId.toLowerCase(), verificationCode(request.id).toLowerCase());
    expect(ok).toMatchObject({ ok: true, currentName: "Lena Brandt", newName: "Lena Ahrens" });
    expect(await cert.verifyCertificate(request.publicId, "AAAAA-AAAAA")).toEqual({ ok: false });
  });
});

describe("Tickets: Web + DM (ohne Discord-Threads)", () => {
  it("Team-Antwort im Web geht per DM raus, nichts landet in einem Thread", async () => {
    const player = await m.db.user.create({ data: { discordId: "555555555555555555", username: "echt", globalName: "Echter Spieler", discordCreatedAt: new Date() } });
    const { ticket } = await m.tickets.createTicket({ creator: player, category: "technik", subject: "Kein Ton", body: "Ich höre niemanden im Voice, seit heute.", fields: { area: "TeamSpeak / SaltyChat" }, source: "WEB" });
    calls.length = 0;
    const { u: hanna, v } = await viewer("hanna.mod");
    const { jobIds } = await m.tickets.addTeamMessage({ viewer: v, actor: hanna, ticketId: ticket.id, body: "Moin, ist SaltyChat aktiviert?" });
    await m.outbox.runOutbox({ ids: jobIds });
    expect(calls.some((c) => c.startsWith("dm:555555555555555555"))).toBe(true);
    expect(calls.some((c) => c.includes("thread"))).toBe(false);
    const msg = await m.db.ticketMessage.findFirstOrThrow({ where: { ticketId: ticket.id, kind: "TEAM" } });
    expect(msg.deliveryStatus).toBe("SENT");

    // Spieler antwortet im Portal → Ticket wieder in Bearbeitung
    await m.tickets.addPlayerMessage({ user: player, ticketId: ticket.id, body: "Ja, ist an. Geht trotzdem nicht." });
    const after = await m.db.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.firstResponseAt).not.toBeNull();
  });

  it("Beschwerden über Teammitglieder sieht die beschuldigte Person nie", async () => {
    const player = await m.db.user.findFirstOrThrow({ where: { discordId: "555555555555555555" } });
    const ole = await user("ole.leitung");
    const { ticket } = await m.tickets.createTicket({
      creator: player,
      category: "beschwerde",
      subject: "Problem mit der Leitung",
      body: "Ich wurde ohne Grund aus dem Talk geworfen.",
      fields: { date: "2026-11-10", time: "20:00", involved: "Ole", noClip: true, noClipReason: "Keine Aufnahme", teamComplaint: true },
      accusedUserIds: [ole.id],
      source: "WEB",
    });
    expect(ticket.sensitivity).toBe("TEAM_COMPLAINT");
    const { v } = await viewer("ole.leitung");
    await expect(m.tickets.loadTicketForTeam(v, ticket.id)).rejects.toThrow();
  });

  it("maximal offene Tickets pro Spieler", async () => {
    const player = await m.db.user.findFirstOrThrow({ where: { discordId: "555555555555555555" } });
    await m.tickets.createTicket({ creator: player, category: "sonstiges", subject: "Drittes Ticket", body: "Noch eine ganz andere Frage zum Server.", fields: {}, source: "WEB" });
    await expect(m.tickets.createTicket({ creator: player, category: "sonstiges", subject: "Viertes Ticket", body: "Und noch eine weitere, völlig neue Frage.", fields: {}, source: "WEB" })).rejects.toThrow("offene Tickets");
  });
});
