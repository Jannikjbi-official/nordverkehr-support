/**
 * Ein Bot („NV Lotse“), zwei Apps: Discord erlaubt nur EINE Interactions-URL pro
 * Bot. Das Support-Center ist der Router – es bearbeitet alles mit `nvs:` und die
 * eigenen Slash-Befehle selbst und reicht alles andere UNVERÄNDERT (Original-Body
 * + Signatur-Header) an das Bewerbungsportal weiter. Weil der Body identisch
 * bleibt, akzeptiert das Portal die Discord-Signatur wie bisher.
 */
import { PREFIX, SUPPORT_COMMAND_NAMES } from "@/lib/discord/interactions";

export interface RawInteraction {
  type: number;
  data?: { name?: string; custom_id?: string };
}

export type Route = "local" | "forward";

/** Rein: Wer ist zuständig? */
export function routeInteraction(i: RawInteraction, forwardConfigured: boolean): Route {
  if (i.type === 1) return "local"; // PING von Discord
  // 2 = Slash-Befehl, 4 = Autocomplete
  if (i.type === 2 || i.type === 4) {
    const name = i.data?.name ?? "";
    if (SUPPORT_COMMAND_NAMES.includes(name)) return "local";
    return forwardConfigured ? "forward" : "local";
  }
  // 3 = Knopf/Auswahl, 5 = Modal
  const cid = i.data?.custom_id ?? "";
  if (cid.startsWith(PREFIX)) return "local";
  return forwardConfigured ? "forward" : "local";
}

/** Original-Anfrage an das Bewerbungsportal weiterreichen und dessen Antwort zurückgeben. */
export async function forwardInteraction(
  url: string,
  rawBody: string,
  headers: { signature: string | null; timestamp: string | null },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2500,
): Promise<Response> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(headers.signature ? { "X-Signature-Ed25519": headers.signature } : {}),
        ...(headers.timestamp ? { "X-Signature-Timestamp": headers.timestamp } : {}),
        "X-Forwarded-By": "nordverkehr-support",
      },
      body: rawBody,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    const text = await res.text();
    return new Response(text, { status: res.status, headers: { "Content-Type": res.headers.get("content-type") ?? "application/json" } });
  } catch (e) {
    console.error("[router] Weiterleitung ans Bewerbungsportal fehlgeschlagen", e);
    return Response.json({
      type: 4,
      data: { content: "Das Bewerbungsportal antwortet gerade nicht. Versuch es in einer Minute nochmal.", flags: 64, allowed_mentions: { parse: [] } },
    });
  }
}
