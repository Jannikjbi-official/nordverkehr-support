/** Datensparsamkeit und Ausgabefilter für die KI – rein, testbar */
import { sanitizeInput } from "@/lib/ai/guard";
import { hostOf } from "@/lib/public-urls";

/** Erwähnungen, Discord-IDs und Links (nur Host bleibt) entfernen, Länge begrenzen */
export function minimize(text: string, max: number) {
  const t = text
    .replace(/<@[!&]?\d+>/g, "[Person]")
    .replace(/\b\d{17,20}\b/g, "[ID]")
    .replace(/https?:\/\/(\S+)/g, (_m, rest: string) => `[Link: ${hostOf(`https://${rest}`)}]`);
  return sanitizeInput(t, max).text;
}

/** Sicherheitsnetz bei Anträgen: Zeilen mit Empfehlung/Bewertung entfernen (die KI entscheidet nichts) */
export function stripRecommendations(text: string) {
  return text
    .split("\n")
    .filter((l) => !/(empfehl|sollte(n)? (angenommen|abgelehnt|entbannt|aufgehoben|gewährt)|würde ich (annehmen|ablehnen)|glaubwürdig|unglaubwürdig|recommend)/i.test(l))
    .join("\n")
    .trim();
}
