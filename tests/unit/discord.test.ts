import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { PREFIX, SUPPORT_COMMAND_NAMES, ids, modalValue, parseCustomId, verifyDiscordSignature } from "@/lib/discord/interactions";
import { forwardInteraction, routeInteraction } from "@/lib/discord/router";
import { commandRequests } from "@/lib/discord/setup";

describe("Custom-IDs (eigenes Präfix nvs:)", () => {
  it("parst alle Support-Knöpfe", () => {
    expect(parseCustomId(ids.panelTicket)).toEqual({ kind: "panelTicket" });
    expect(parseCustomId(ids.newTicket("technik"))).toEqual({ kind: "newTicket", category: "technik" });
    expect(parseCustomId(ids.rate("abcdefghij12", 4))).toEqual({ kind: "rate", ticketId: "abcdefghij12", stars: 4 });
  });

  it("ignoriert Knöpfe des Bewerbungsportals (nv:) und Unsinn", () => {
    expect(parseCustomId("nv:claim:abcdefghij12")).toBeNull();
    expect(parseCustomId("nvs:t:rate:abcdefghij12:9")).toBeNull();
    expect(parseCustomId("nvs:t:claim:abcdefghij12")).toBeNull(); // Threads/Claim-Knopf gibt es nicht mehr
    expect(parseCustomId("nvs:t:rate:../../x:3")).toBeNull();
  });

  it("Präfixe überschneiden sich nicht", () => {
    expect(PREFIX).toBe("nvs:");
    expect("nv:claim:x".startsWith(PREFIX)).toBe(false);
  });

  it("liest Modal-Werte (alte und neue Struktur)", () => {
    expect(modalValue({ components: [{ type: 1, components: [{ custom_id: "body", value: "Hallo" }] }] }, "body")).toBe("Hallo");
    expect(modalValue({ components: [{ type: 18, component: { custom_id: "body", value: "Neu" } }] }, "body")).toBe("Neu");
  });
});

describe("Router: ein Bot, zwei Apps", () => {
  it("PING und Support-Befehle/-Knöpfe bleiben hier", () => {
    expect(routeInteraction({ type: 1 }, true)).toBe("local");
    expect(routeInteraction({ type: 2, data: { name: "ticket" } }, true)).toBe("local");
    expect(routeInteraction({ type: 3, data: { custom_id: "nvs:panel:ticket" } }, true)).toBe("local");
    expect(routeInteraction({ type: 5, data: { custom_id: "nvs:new:bug" } }, true)).toBe("local");
  });

  it("alles vom Bewerbungsportal wird weitergereicht", () => {
    expect(routeInteraction({ type: 2, data: { name: "bewerbung" } }, true)).toBe("forward");
    expect(routeInteraction({ type: 2, data: { name: "claim" } }, true)).toBe("forward");
    expect(routeInteraction({ type: 3, data: { custom_id: "nv:claim:abc" } }, true)).toBe("forward");
    expect(routeInteraction({ type: 5, data: { custom_id: "nv:replysubmit:abc" } }, true)).toBe("forward");
  });

  it("ohne Weiterleitungs-URL bleibt alles lokal", () => {
    expect(routeInteraction({ type: 3, data: { custom_id: "nv:claim:abc" } }, false)).toBe("local");
  });

  it("keine Befehlsnamen-Kollision mit dem Bewerbungsportal", () => {
    for (const portal of ["bewerbung", "offen", "claim"]) expect(SUPPORT_COMMAND_NAMES).not.toContain(portal);
  });

  it("leitet Body und Signatur-Header unverändert weiter", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: 4, data: { content: "ok" } }), { status: 200, headers: { "content-type": "application/json" } }));
    const body = JSON.stringify({ type: 3, data: { custom_id: "nv:claim:abc" } });
    const res = await forwardInteraction("https://bewerbung.example/api/discord/interactions", body, { signature: "sig", timestamp: "123" }, fetchMock as unknown as typeof fetch);
    expect(await res.json()).toEqual({ type: 4, data: { content: "ok" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://bewerbung.example/api/discord/interactions");
    expect(init.body).toBe(body);
    expect((init.headers as Record<string, string>)["X-Signature-Ed25519"]).toBe("sig");
    expect((init.headers as Record<string, string>)["X-Signature-Timestamp"]).toBe("123");
  });

  it("antwortet ehrlich, wenn das Bewerbungsportal nicht reagiert", async () => {
    const fetchMock = vi.fn(async () => Promise.reject(new Error("timeout")));
    const res = await forwardInteraction("https://x", "{}", { signature: null, timestamp: null }, fetchMock as unknown as typeof fetch);
    const data = (await res.json()) as { type: number; data: { flags: number } };
    expect(data.type).toBe(4);
    expect(data.data.flags).toBe(64);
  });
});

describe("Befehle registrieren", () => {
  it("nur einzeln per POST – nie PUT (sonst wären die Befehle des Bewerbungsportals weg)", () => {
    const reqs = commandRequests("app", "guild");
    expect(reqs.length).toBe(3);
    for (const r of reqs) {
      expect(r.method).toBe("POST");
      expect(r.url).toBe("https://discord.com/api/v10/applications/app/guilds/guild/commands");
    }
  });
});

describe("Signaturprüfung", () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("hex");
  const now = 1_800_000_000;

  it("akzeptiert gültige, frische Signaturen", () => {
    const body = '{"type":1}';
    const ts = String(now);
    const sig = sign(null, Buffer.from(ts + body), privateKey).toString("hex");
    expect(verifyDiscordSignature(raw, sig, ts, body, now)).toBe(true);
  });

  it("lehnt veränderte Bodys und alte Zeitstempel ab", () => {
    const ts = String(now);
    const sig = sign(null, Buffer.from(ts + '{"type":1}'), privateKey).toString("hex");
    expect(verifyDiscordSignature(raw, sig, ts, '{"type":2}', now)).toBe(false);
    expect(verifyDiscordSignature(raw, sig, ts, '{"type":1}', now + 3600)).toBe(false);
    expect(verifyDiscordSignature(raw, null, ts, '{"type":1}', now)).toBe(false);
  });
});
