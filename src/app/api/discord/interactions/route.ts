import { env } from "@/lib/env";
import { getDiscordPublicKey, verifyDiscordSignature, ephemeral } from "@/lib/discord/interactions";
import { forwardInteraction, routeInteraction } from "@/lib/discord/router";
import { handleCommand, handleComponent, handleModal, type Interaction } from "@/lib/discord/handlers";

export const maxDuration = 30;

/**
 * Discord-Interaktionen für den Bot „NV Lotse“. Diese URL ist DIE Interactions-URL
 * der Discord-App (nur eine pro Bot möglich). Support-Interaktionen (`nvs:`, eigene
 * Befehle) werden hier bearbeitet, alles andere unverändert ans Bewerbungsportal
 * weitergereicht (INTERACTIONS_FORWARD_URL). Signatur wird immer geprüft.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-signature-ed25519");
  const timestamp = req.headers.get("x-signature-timestamp");
  const key = await getDiscordPublicKey();
  if (!key || !verifyDiscordSignature(key, signature, timestamp, body)) {
    return new Response("Ungültige Signatur", { status: 401 });
  }
  let i: Interaction;
  try {
    i = JSON.parse(body) as Interaction;
  } catch {
    return new Response("Ungültig", { status: 400 });
  }

  const forwardUrl = env().INTERACTIONS_FORWARD_URL;
  if (routeInteraction(i, !!forwardUrl) === "forward") {
    return forwardInteraction(forwardUrl!, body, { signature, timestamp });
  }

  try {
    switch (i.type) {
      case 1:
        return Response.json({ type: 1 }); // PING
      case 2:
        return await handleCommand(i);
      case 3:
        return await handleComponent(i);
      case 5:
        return await handleModal(i);
      default:
        return Response.json(ephemeral("Diese Aktion kenne ich nicht."));
    }
  } catch (e) {
    console.error("[interactions]", e);
    return Response.json(ephemeral("Da ist etwas schiefgelaufen. Versuch es im Portal."));
  }
}
