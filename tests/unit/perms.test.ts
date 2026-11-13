import { describe, expect, it } from "vitest";
import {
  canDecide,
  canReceiveTicket,
  checkApproval,
  checkPropose,
  needsSecondApproval,
  requestTeamWhere,
  teamCanSeeRequest,
  teamCanSeeTicket,
  ticketMayUseDiscord,
  ticketTeamWhere,
  type Viewer,
} from "@/lib/perms";

const v = (teamLevel: Viewer["teamLevel"], discordId = "111", userId = `u-${discordId}`): Viewer => ({ userId, discordId, teamLevel });

const support = v("SUPPORT", "200");
const mod = v("MODERATION", "300");
const mod2 = v("MODERATION", "301");
const lead = v("LEITUNG", "400");
const player = v("NONE", "100");

const ticket = (o: Partial<{ sensitivity: "NORMAL" | "MOD_ONLY" | "TEAM_COMPLAINT"; accusedDiscordIds: string[]; creatorId: string }> = {}) => ({
  creatorId: o.creatorId ?? player.userId,
  sensitivity: o.sensitivity ?? "NORMAL",
  accusedDiscordIds: o.accusedDiscordIds ?? [],
});

describe("Rollenrechte: Tickets", () => {
  it("normale Tickets sieht das ganze Team, Spieler nicht über die Team-Ansicht", () => {
    expect(teamCanSeeTicket(support, ticket())).toBe(true);
    expect(teamCanSeeTicket(mod, ticket())).toBe(true);
    expect(teamCanSeeTicket(lead, ticket())).toBe(true);
    expect(teamCanSeeTicket(player, ticket())).toBe(false);
  });

  it("MOD_ONLY nur für Moderation/Leitung", () => {
    const t = ticket({ sensitivity: "MOD_ONLY" });
    expect(teamCanSeeTicket(support, t)).toBe(false);
    expect(teamCanSeeTicket(mod, t)).toBe(true);
    expect(teamCanSeeTicket(lead, t)).toBe(true);
  });

  it("Prisma-Filter: Support nur NORMAL, alle ohne eigene Beschuldigung", () => {
    expect(ticketTeamWhere(support)).toEqual({ AND: [{ NOT: { accusedDiscordIds: { has: "200" } } }, { sensitivity: "NORMAL" }] });
    expect(ticketTeamWhere(lead)).toEqual({ AND: [{ NOT: { accusedDiscordIds: { has: "400" } } }, {}] });
    expect(ticketTeamWhere(player)).toEqual({ id: "__none__" });
  });
});

describe("Beschwerde über ein Teammitglied", () => {
  const complaint = ticket({ sensitivity: "TEAM_COMPLAINT", accusedDiscordIds: [mod.discordId] });

  it("die beschuldigte Person sieht das Ticket nie – auch als Moderation", () => {
    expect(teamCanSeeTicket(mod, complaint)).toBe(false);
  });

  it("andere Moderation/Leitung sehen es, Support nicht", () => {
    expect(teamCanSeeTicket(mod2, complaint)).toBe(true);
    expect(teamCanSeeTicket(lead, complaint)).toBe(true);
    expect(teamCanSeeTicket(support, complaint)).toBe(false);
  });

  it("auch die Leitung sieht es nicht, wenn sie selbst beschuldigt ist", () => {
    const againstLead = ticket({ sensitivity: "TEAM_COMPLAINT", accusedDiscordIds: [lead.discordId] });
    expect(teamCanSeeTicket(lead, againstLead)).toBe(false);
    expect(teamCanSeeTicket(mod, againstLead)).toBe(true);
  });

  it("Beschuldigung schlägt jede Sichtbarkeit – auch bei NORMAL", () => {
    expect(teamCanSeeTicket(support, ticket({ accusedDiscordIds: [support.discordId] }))).toBe(false);
  });

  it("unbekannter Beschuldigter: vorerst nur die Leitung", () => {
    const unknown = ticket({ sensitivity: "TEAM_COMPLAINT", accusedDiscordIds: [] });
    expect(teamCanSeeTicket(mod, unknown)).toBe(false);
    expect(teamCanSeeTicket(lead, unknown)).toBe(true);
  });

  it("geht nie in einen Discord-Thread (Mods mit „Threads verwalten“ sähen ihn)", () => {
    expect(ticketMayUseDiscord(complaint)).toBe(false);
    expect(ticketMayUseDiscord(ticket())).toBe(true);
  });

  it("darf nicht an die beschuldigte Person weitergegeben werden", () => {
    expect(canReceiveTicket(mod, complaint)).toBe(false);
    expect(canReceiveTicket(mod2, complaint)).toBe(true);
  });
});

describe("Rollenrechte: Anträge", () => {
  const types = [
    { id: "t-unban", visibleFrom: "MODERATION" as const, decideFrom: "MODERATION" as const, fourEyes: true },
    { id: "t-name", visibleFrom: "SUPPORT" as const, decideFrom: "SUPPORT" as const, fourEyes: false },
    { id: "t-faction", visibleFrom: "SUPPORT" as const, decideFrom: "LEITUNG" as const, fourEyes: false },
  ];

  it("Entbannungen nur für Moderation/Leitung sichtbar", () => {
    expect(teamCanSeeRequest(support, types[0])).toBe(false);
    expect(teamCanSeeRequest(mod, types[0])).toBe(true);
    expect(requestTeamWhere(support, types)).toEqual({ typeId: { in: ["t-name", "t-faction"] } });
    expect(requestTeamWhere(player, types)).toEqual({ typeId: { in: [] } });
  });

  it("Entscheiden je Antragsart", () => {
    expect(canDecide(support, types[1])).toBe(true);
    expect(canDecide(mod, types[2])).toBe(false);
    expect(canDecide(lead, types[2])).toBe(true);
  });
});

describe("Vier-Augen-Prinzip", () => {
  const type = { visibleFrom: "MODERATION" as const, decideFrom: "MODERATION" as const, fourEyes: true };
  const request = { applicantId: player.userId, issuedByDiscordId: mod.discordId, status: "IN_REVIEW" };
  const proposal = { proposedById: mod2.userId, status: "PENDING" };

  it("Entbannung braucht immer eine zweite Person", () => {
    expect(needsSecondApproval(type, request, mod2)).toBe(true);
  });

  it("wer die Strafe ausgesprochen hat, braucht auch ohne Vier-Augen-Pflicht eine zweite Person", () => {
    expect(needsSecondApproval({ fourEyes: false }, request, mod)).toBe(true);
    expect(needsSecondApproval({ fourEyes: false }, request, mod2)).toBe(false);
  });

  it("den eigenen Vorschlag kann man nicht selbst bestätigen", () => {
    const r = checkApproval(mod2, type, request, proposal);
    expect(r.ok).toBe(false);
  });

  it("wer die Strafe ausgesprochen hat, zählt nie als zweite Person", () => {
    const r = checkApproval(mod, type, request, proposal);
    expect(r).toEqual({ ok: false, reason: expect.stringContaining("ausgesprochen") });
  });

  it("eine andere Person aus Moderation/Leitung darf zustimmen", () => {
    expect(checkApproval(lead, type, request, proposal)).toEqual({ ok: true });
  });

  it("Support darf bei Entbannungen weder vorschlagen noch zustimmen", () => {
    expect(checkApproval(support, type, request, proposal).ok).toBe(false);
    expect(checkPropose(support, type, request).ok).toBe(false);
  });

  it("entschiedene Anträge und erledigte Vorschläge sind zu", () => {
    expect(checkApproval(lead, type, { ...request, status: "DECIDED" }, proposal).ok).toBe(false);
    expect(checkApproval(lead, type, request, { ...proposal, status: "SUPERSEDED" }).ok).toBe(false);
  });

  it("über eigene Anträge entscheidet niemand", () => {
    const own = { ...request, applicantId: lead.userId };
    expect(checkPropose(lead, type, own).ok).toBe(false);
    expect(checkApproval(lead, type, own, proposal).ok).toBe(false);
  });
});
