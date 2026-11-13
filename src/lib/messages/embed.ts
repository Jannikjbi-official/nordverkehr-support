/**
* Bausteine für Discord-Nachrichten im Nordverkehr-Design – als
 * Components V2 (Flag IS_COMPONENTS_V2): ein Container mit Akzentfarbe,
 * Textanzeigen, Trennern, Thumbnail und Link-Buttons. Kein `content`,
 * keine `embeds` (bei V2 nicht erlaubt).
 */
import type {
  APIActionRowComponent,
  APIButtonComponent,
  APIButtonComponentWithURL,
  APIComponentInContainer,
  APISectionComponent,
  APISeparatorComponent,
  APITextDisplayComponent,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";

export const BRAND_COLOR = 0xc41e1e;
export const WARN_COLOR = 0xf3c25b;
export const NEUTRAL_COLOR = 0x4e5058;
/** Logo für Discord-Nachrichten – liegt im Portal unter /logo.png */
export const LOGO_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://support.nordverkehr.xyz"}/logo.png`;
/** MessageFlags.IsComponentsV2 */
export const COMPONENTS_V2 = 1 << 15;
/** Discord erlaubt bei V2 insgesamt 4000 Zeichen Text pro Nachricht */
export const V2_TEXT_LIMIT = 4000;
/** Maximal für den Nachrichtentext reserviert (Rest: Kopf, Fußzeile) */
export const BODY_LIMIT = 3400;

// ─── Bausteine ────────────────────────────────────────────────

export const text = (content: string): APITextDisplayComponent => ({ type: 10, content });

export const separator = (divider = true, spacing: 1 | 2 = 1): APISeparatorComponent => ({ type: 14, divider, spacing });

/** Text links, Bild rechts (Avatar/Logo). */
export function section(lines: string[], thumbnailUrl: string): APISectionComponent {
  return {
    type: 9,
    components: lines.slice(0, 3).map(text),
    accessory: { type: 11, media: { url: thumbnailUrl } },
  };
}

/** Link-Buttons – Discord akzeptiert dort nur https-Links. */
export function linkButtons(links: { label: string; url: string | null | undefined }[]): APIActionRowComponent<APIButtonComponentWithURL> | null {
  const buttons = links
    .filter((l): l is { label: string; url: string } => !!l.url && /^https:\/\//.test(l.url))
    .slice(0, 5)
    .map((l) => ({ type: 2 as const, style: 5 as const, label: l.label.slice(0, 80), url: l.url }));
  return buttons.length ? { type: 1, components: buttons } : null;
}

export const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1) + "…" : s);

/** Discord-Zeitstempel, im Client lokal formatiert. */
export const discordTime = (d: Date, style: "f" | "R" | "D" | "t" = "f") => `<t:${Math.floor(d.getTime() / 1000)}:${style}>`;

/** Eine V2-Nachricht aus einem Container. Erwähnungen werden angezeigt, pingen aber nie. */
export function v2Message(accent: number, children: (APIComponentInContainer | null | false)[]): RESTPostAPIChannelMessageJSONBody {
  return {
    flags: COMPONENTS_V2,
    components: [{ type: 17, accent_color: accent, components: children.filter(Boolean) as APIComponentInContainer[] }],
    allowed_mentions: { parse: [] },
  };
}

/** Alle Textanzeigen einer Nachricht zusammen (für das 4000-Zeichen-Limit und Tests). */
export function v2Text(msg: RESTPostAPIChannelMessageJSONBody): string {
  const out: string[] = [];
  const walk = (c: unknown) => {
    if (!c || typeof c !== "object") return;
    const o = c as { type?: number; content?: string; components?: unknown[] };
    if (o.type === 10 && o.content) out.push(o.content);
    o.components?.forEach(walk);
  };
  (msg.components ?? []).forEach(walk);
  return out.join("\n");
}


export interface ActionButton {
  label: string;
  customId: string;
  emoji?: string;
  /** 1 = blau (primär), 2 = grau, 3 = grün, 4 = rot */
  style?: 1 | 2 | 3 | 4;
}

/** Interaktions-Knöpfe (max. 4) + optional ein Link-Knopf in einer Zeile. */
export function buttonRow(actions: ActionButton[], link?: { label: string; url: string | null | undefined }): APIActionRowComponent<APIButtonComponent> {
  const components: APIButtonComponent[] = actions.slice(0, link?.url ? 4 : 5).map((a) => ({
    type: 2,
    style: a.style ?? 2,
    label: a.label.slice(0, 80),
    custom_id: a.customId,
    ...(a.emoji ? { emoji: { name: a.emoji } } : {}),
  }));
  if (link?.url && /^https:\/\//.test(link.url)) components.push({ type: 2, style: 5, label: link.label.slice(0, 80), url: link.url });
  return { type: 1, components };
}
