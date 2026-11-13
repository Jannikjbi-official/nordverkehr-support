import { describe, expect, it } from "vitest";
import type { DiscordMessageInfo } from "@/lib/discord/client";
import { applyToTicket, mapThreadMessages } from "@/lib/tickets/sync";
import { statusAfterMessage } from "@/lib/tickets/status";
import { buildMirrorMessage } from "@/lib/discord/messages";
import { executeJob } from "@/lib/discord/outbox";
import type { DiscordApi } from "@/lib/discord/client";

const msg = (o: Partial<DiscordMessageInfo>): DiscordMessageInfo => ({
  id: "1000",
  channelId: "thread",
  content: "Hallo",
  authorId: "player",
  authorName: "Finn",
  authorIsBot: false,
  type: 0,
  createdAt: new Date("2026-11-13T10:00:00Z"),
  attachments: [],
  ...o,
});

describe("Sync Discord → Web", () => {
  it("Ersteller = Spieler, alle anderen im privaten Thread = Team", () => {
    const out = mapThreadMessages([msg({ id: "1" }), msg({ id: "2", authorId: "mod", authorName: "Hanna" })], "player", new Set());
    expect(out.map((m) => m.kind)).toEqual(["PLAYER", "TEAM"]);
  });

  it("übernimmt keine Bot-Nachrichten (keine Echo-Schleife der Web-Spiegelung)", () => {
    const out = mapThreadMessages([msg({ id: "1", authorIsBot: true, content: "**Jonas** · Team (Portal)\nHi" })], "player", new Set());
    expect(out).toEqual([]);
  });

  it("überspringt bereits übernommene und Systemnachrichten", () => {
    const out = mapThreadMessages([msg({ id: "1" }), msg({ id: "2", type: 7 }), msg({ id: "3", type: 19, content: "Antwort" })], "player", new Set(["1"]));
    expect(out.map((m) => m.discordMessageId)).toEqual(["3"]);
  });

  it("Anhänge kommen als Links mit, leere Nachrichten fallen weg", () => {
    const out = mapThreadMessages(
      [msg({ id: "1", content: "", attachments: [{ url: "https://cdn.discordapp.com/x.png", filename: "x.png", contentType: "image/png" }] }), msg({ id: "2", content: "   " })],
      "player",
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0].links).toEqual(["https://cdn.discordapp.com/x.png"]);
  });

  it("Status-Automatik: Team antwortet → wartet auf Spieler; Spieler antwortet → in Bearbeitung", () => {
    const base = { status: "IN_PROGRESS" as const, firstResponseAt: null, lastPlayerAt: null, lastTeamAt: null, waitingSince: null };
    const team = mapThreadMessages([msg({ id: "1", authorId: "mod" })], "player", new Set());
    const a = applyToTicket(base, team);
    expect(a.status).toBe("WAITING_PLAYER");
    expect(a.firstResponseAt).toEqual(team[0].createdAt);
    const b = applyToTicket({ ...base, ...a }, mapThreadMessages([msg({ id: "2" })], "player", new Set()));
    expect(b.status).toBe("IN_PROGRESS");
    expect(b.waitingSince).toBeNull();
    expect(b.resetWarning).toBe(true);
  });

  it("geschlossene Tickets bleiben geschlossen", () => {
    expect(statusAfterMessage("CLOSED", "PLAYER")).toBe("CLOSED");
    expect(statusAfterMessage("CLOSED", "TEAM")).toBe("CLOSED");
    expect(statusAfterMessage("RESOLVED", "PLAYER")).toBe("IN_PROGRESS");
    expect(statusAfterMessage("OPEN", "PLAYER")).toBe("OPEN");
  });
});

describe("Sync Web → Discord", () => {
  it("Spiegel-Nachricht pingt niemanden, auch nicht über eingeschleuste Erwähnungen", () => {
    const m = buildMirrorMessage({ authorName: "Finn", role: "Spieler", body: "Hey @everyone <@123> schaut mal" });
    expect(m.allowed_mentions).toEqual({ parse: [] });
    expect(m.content).not.toContain("<@123>");
    expect(m.content).not.toMatch(/@everyone(?!​)/);
  });

  it("Thread-Nachricht öffnet archivierte Threads vorher wieder", async () => {
    const calls: string[] = [];
    const api = {
      updateThread: async (_id: string, p: { archived?: boolean }) => void calls.push(`update:${p.archived}`),
      postMessage: async () => (calls.push("post"), "m1"),
    } as unknown as DiscordApi;
    const r = await executeJob({ id: "j", type: "THREAD_MESSAGE", payload: { type: "THREAD_MESSAGE", threadId: "t", message: { content: "x" }, unarchive: true }, attempts: 0, maxAttempts: 5, ticketId: "t1", ticketMessageId: null, requestMessageId: null }, api);
    expect(r).toEqual({ kind: "done", result: { messageId: "m1" } });
    expect(calls).toEqual(["update:false", "post"]);
  });

  it("Test-/Seed-Nutzer bekommen nie DMs", async () => {
    const api = { openDm: async () => { throw new Error("darf nicht aufgerufen werden"); } } as unknown as DiscordApi;
    const r = await executeJob({ id: "j", type: "DM", payload: { type: "DM", discordUserId: "0100000000000000001", message: { content: "x" }, purpose: "ticket_reply" }, attempts: 0, maxAttempts: 5, ticketId: null, ticketMessageId: null, requestMessageId: null }, api);
    expect(r).toEqual({ kind: "done", result: { skipped: "test" } });
  });
});
