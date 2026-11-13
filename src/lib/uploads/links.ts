/**
 * Clip-Links: nur YouTube, Twitch und Medal (https). Rein, auch im Browser nutzbar.
 */
export const CLIP_HOSTS: { host: string; provider: string }[] = [
  { host: "youtube.com", provider: "YouTube" },
  { host: "youtu.be", provider: "YouTube" },
  { host: "twitch.tv", provider: "Twitch" },
  { host: "medal.tv", provider: "Medal" },
];

export const CLIP_HOSTS_LABEL = "YouTube, Twitch, Medal";

export function clipProvider(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  const hit = CLIP_HOSTS.find((h) => host === h.host || host.endsWith(`.${h.host}`));
  return hit?.provider ?? null;
}

export const isAllowedClipUrl = (url: string) => clipProvider(url) !== null;

/** Alle erlaubten Clip-Links aus einem Freitext */
export function extractClipLinks(text: string): string[] {
  const found = text.match(/https:\/\/[^\s<>()]+/gi) ?? [];
  return [...new Set(found.filter(isAllowedClipUrl))].slice(0, 10);
}
