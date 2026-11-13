import { afterEach, describe, expect, it, vi } from "vitest";
import { channelsForMutation, realtimeConfig } from "@/lib/realtime";
import { liveChannels } from "@/lib/live-channels";

describe("Live-Signale: welche Kanäle?", () => {
  it("neue Spieler-/Team-Nachricht im Ticket → Spieler, Team und Team-Liste", () => {
    expect(channelsForMutation("TicketMessage", "create", { data: { ticketId: "t1", kind: "TEAM" } }, { id: "m1", ticketId: "t1", kind: "TEAM" })).toEqual([
      "nvs-t-t1",
      "nvs-t-t1-team",
      "nvs-team-tickets",
    ]);
  });

  it("interne Notiz → NUR Team-Kanal (Spieler bekommt kein Signal)", () => {
    expect(channelsForMutation("TicketMessage", "create", { data: { ticketId: "t1", kind: "INTERNAL" } }, { id: "m1", ticketId: "t1", kind: "INTERNAL" })).toEqual(["nvs-t-t1-team"]);
    expect(channelsForMutation("RequestComment", "create", { data: { requestId: "r1" } }, { id: "c1", requestId: "r1" })).toEqual(["nvs-r-r1-team"]);
    expect(channelsForMutation("RequestVote", "upsert", { where: { requestId_userId: { requestId: "r1", userId: "u" } } }, { requestId: "r1" })).toEqual(["nvs-r-r1-team"]);
  });

  it("findet die ID auch bei select oder connect", () => {
    expect(channelsForMutation("TicketMessage", "create", { data: { ticket: { connect: { id: "t2" } }, kind: "PLAYER" }, select: { id: true } }, { id: "m" })).toContain("nvs-t-t2");
    expect(channelsForMutation("Ticket", "updateMany", { where: { id: "t3", status: "OPEN" }, data: {} }, { count: 1 })).toContain("nvs-t-t3");
  });

  it("Lesen, Zustell-Status und fremde Modelle lösen nichts aus", () => {
    expect(channelsForMutation("Ticket", "findMany", {}, [])).toEqual([]);
    expect(channelsForMutation("TicketMessage", "updateMany", { where: { id: "m" }, data: { deliveryStatus: "SENT" } }, { count: 1 })).toEqual([]);
    expect(channelsForMutation("User", "update", { where: { id: "u" }, data: {} }, { id: "u" })).toEqual([]);
  });

  it("Spieler abonniert nie Team-Kanäle", () => {
    expect(liveChannels({ type: "ticket", id: "t1", perspective: "player" })).toEqual(["nvs-t-t1"]);
    expect(liveChannels({ type: "request", id: "r1", perspective: "team" })).toEqual(["nvs-r-r1", "nvs-r-r1-team"]);
  });
});

describe("Live-Signale: Versand", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("pusher");
  });

  it("ohne Pusher-Konfiguration aus", () => {
    expect(realtimeConfig({})).toBeNull();
    expect(realtimeConfig({ PUSHER_APP_ID: "1", PUSHER_SECRET: "s", NEXT_PUBLIC_PUSHER_KEY: "k" })).toMatchObject({ cluster: "eu" });
  });

  it("sammelt Signale und schickt sie gebündelt", async () => {
    const trigger = vi.fn().mockResolvedValue({});
    vi.doMock("pusher", () => ({ default: vi.fn().mockImplementation(function () { return { trigger }; }) }));
    Object.assign(process.env, { PUSHER_APP_ID: "1", PUSHER_SECRET: "s", NEXT_PUBLIC_PUSHER_KEY: "k" });
    try {
      const { notifyChanged } = await import("@/lib/realtime");
      notifyChanged(["nvs-t-a", "nvs-team-tickets"]);
      notifyChanged(["nvs-t-a"]);
      await vi.waitFor(() => expect(trigger).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(trigger).toHaveBeenCalledWith(["nvs-t-a", "nvs-team-tickets"], "changed", {});
    } finally {
      delete process.env.PUSHER_APP_ID;
      delete process.env.PUSHER_SECRET;
      delete process.env.NEXT_PUBLIC_PUSHER_KEY;
    }
  });
});
