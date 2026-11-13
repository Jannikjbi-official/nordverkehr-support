import { describe, expect, it, vi } from "vitest";
import { canServeStale, levelFromRoles, needsRefresh, resolveAccess, type AccessDeps, type AccessSubject } from "@/lib/auth/access";

const roles = { supportRoleId: "1", moderationRoleId: "2", leitungRoleId: "3" };
const NOW = new Date("2026-11-13T12:00:00Z");

function subject(o: Partial<AccessSubject> = {}): AccessSubject {
  return {
    id: "u1",
    discordId: "999",
    inGuild: false,
    teamLevel: "NONE",
    roleIds: [],
    roleCheckedAt: null,
    guildBanned: false,
    guildBanReason: null,
    banCheckedAt: null,
    ...o,
  };
}

function deps(o: Partial<AccessDeps> = {}): AccessDeps {
  return {
    config: { guildId: "g", ...roles, ttlMs: 60_000, banTtlMs: 300_000 },
    now: () => NOW,
    fetchMember: vi.fn(async () => null),
    fetchBan: vi.fn(async () => null),
    persist: vi.fn(async () => {}),
    ...o,
  };
}

describe("Team-Stufen aus Discord-Rollen", () => {
  it("höchste Rolle zählt", () => {
    expect(levelFromRoles(["1"], roles)).toBe("SUPPORT");
    expect(levelFromRoles(["1", "2"], roles)).toBe("MODERATION");
    expect(levelFromRoles(["2", "3", "1"], roles)).toBe("LEITUNG");
    expect(levelFromRoles(["7"], roles)).toBe("NONE");
  });

  it("wird bei abgelaufenem Cache neu geprüft – entzogene Rolle = kein Zugriff", async () => {
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: ["5"], joinedAt: null, nick: null })) });
    const a = await resolveAccess(subject({ teamLevel: "LEITUNG", inGuild: true, roleCheckedAt: new Date(NOW.getTime() - 120_000) }), d);
    expect(a.teamLevel).toBe("NONE");
    expect(a.isTeam).toBe(false);
    expect(d.fetchMember).toHaveBeenCalledOnce();
  });

  it("frischer Cache wird ohne Discord-Abfrage genutzt", async () => {
    const d = deps();
    const a = await resolveAccess(subject({ teamLevel: "MODERATION", inGuild: true, roleCheckedAt: new Date(NOW.getTime() - 10_000) }), d);
    expect(a.isMod).toBe(true);
    expect(d.fetchMember).not.toHaveBeenCalled();
  });

  it("fail closed: Discord nicht erreichbar → kein Team-Zugriff", async () => {
    const d = deps({ fetchMember: vi.fn(async () => Promise.reject(new Error("down"))) });
    const a = await resolveAccess(subject({ teamLevel: "LEITUNG", inGuild: true }), d);
    expect(a.isTeam).toBe(false);
    expect(a.source).toBe("error");
    expect(d.persist).not.toHaveBeenCalled();
  });
});

describe("Zugriff für gebannte Spieler", () => {
  it("nicht auf dem Server + Bann → guildBanned", async () => {
    const d = deps({ fetchBan: vi.fn(async () => ({ reason: "Cheating" })) });
    const a = await resolveAccess(subject(), d);
    expect(a.guildBanned).toBe(true);
    expect(a.guildBanReason).toBe("Cheating");
    expect(a.isTeam).toBe(false);
  });

  it("auf dem Server → nie gebannt, kein Bann-Abruf", async () => {
    const d = deps({ fetchMember: vi.fn(async () => ({ roles: [], joinedAt: null, nick: null })) });
    const a = await resolveAccess(subject({ guildBanned: true }), d);
    expect(a.guildBanned).toBe(false);
    expect(d.fetchBan).not.toHaveBeenCalled();
  });

  it("Bann nicht prüfbar → letzter bekannter Stand bleibt", async () => {
    const d = deps({ fetchBan: vi.fn(async () => Promise.reject(new Error("50013"))) });
    const a = await resolveAccess(subject({ guildBanned: true, guildBanReason: "x" }), d);
    expect(a.guildBanned).toBe(true);
  });
});

describe("Rollen-Cache: im Hintergrund auffrischen", () => {
  const now = new Date("2026-11-13T12:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);
  const cfg = { ttlMs: 60_000, banTtlMs: 300_000 };

  it("frisch → kein Abruf nötig", () => {
    expect(needsRefresh({ roleCheckedAt: ago(30), banCheckedAt: null, inGuild: true }, cfg, now)).toBe(false);
  });
  it("Rollen älter als TTL → auffrischen; bis 10 Min. darf der alte Stand sofort geliefert werden", () => {
    const s = { roleCheckedAt: ago(120), banCheckedAt: null, inGuild: true };
    expect(needsRefresh(s, cfg, now)).toBe(true);
    expect(canServeStale(s, now, 600_000)).toBe(true);
    expect(canServeStale({ ...s, roleCheckedAt: ago(900) }, now, 600_000)).toBe(false);
  });
  it("nicht auf dem Server: Bann-Stand muss auch noch jung genug sein", () => {
    expect(canServeStale({ roleCheckedAt: ago(120), banCheckedAt: ago(120), inGuild: false }, now, 600_000)).toBe(true);
    expect(canServeStale({ roleCheckedAt: ago(120), banCheckedAt: null, inGuild: false }, now, 600_000)).toBe(false);
  });
});
