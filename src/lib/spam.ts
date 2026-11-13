/**
 * Spam-Schutz – rein und testbar.
 *  - Copy-Paste-Spam: derselbe (oder fast derselbe) Text kurz hintereinander
 *  - Zeichensalat: lange Wiederholungen, kaum echte Wörter
 *  - Link-Flut
 */

/** Text für Vergleiche vereinheitlichen */
export function normalizeForCompare(text: string) {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shingles(text: string, size = 3): Set<string> {
  const words = normalizeForCompare(text).split(" ").filter(Boolean);
  const out = new Set<string>();
  if (words.length < size) {
    if (words.length) out.add(words.join(" "));
    return out;
  }
  for (let i = 0; i <= words.length - size; i++) out.add(words.slice(i, i + size).join(" "));
  return out;
}

/** Ähnlichkeit 0..1 (Jaccard über Wort-Trigramme) */
export function similarity(a: string, b: string): number {
  const A = shingles(a);
  const B = shingles(b);
  if (!A.size || !B.size) return normalizeForCompare(a) === normalizeForCompare(b) ? 1 : 0;
  let inter = 0;
  for (const s of A) if (B.has(s)) inter++;
  return inter / (A.size + B.size - inter);
}

export type SpamVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Prüft einen neuen Text gegen die letzten eigenen Texte (und optional fremde
 * Texte der letzten Minuten – Copy-Paste-Wellen).
 */
export function checkSpam(text: string, opts: { recentOwn?: string[]; recentOthers?: string[]; minLength?: number } = {}): SpamVerdict {
  const t = text.trim();
  const norm = normalizeForCompare(t);
  if (t.length < (opts.minLength ?? 2)) return { ok: false, reason: "Die Nachricht ist zu kurz." };
  if (/(.)\1{24,}/u.test(t)) return { ok: false, reason: "Die Nachricht sieht nach Zeichensalat aus." };
  const links = t.match(/https?:\/\//g)?.length ?? 0;
  if (links > 8) return { ok: false, reason: "Bitte nicht so viele Links auf einmal." };
  if (t.length > 40) {
    const letters = (norm.match(/\p{L}/gu) ?? []).length;
    if (letters / t.length < 0.25 && links === 0) return { ok: false, reason: "Die Nachricht sieht nach Zeichensalat aus." };
  }
  if (norm.length >= 20) {
    if ((opts.recentOwn ?? []).some((o) => similarity(o, t) >= 0.9)) {
      return { ok: false, reason: "Das hast du gerade schon so geschickt. Bitte nicht doppelt senden." };
    }
    if ((opts.recentOthers ?? []).filter((o) => similarity(o, t) >= 0.9).length >= 2) {
      return { ok: false, reason: "Dieser Text wurde gerade mehrfach eingereicht. Schreib bitte in eigenen Worten." };
    }
  }
  return { ok: true };
}

/** Honeypot + Mindest-Ausfüllzeit für Formulare */
export function looksLikeBot(form: { honeypot?: string | null; startedAt?: number | null }, now = Date.now(), minMs = 3000) {
  if (form.honeypot && form.honeypot.trim()) return true;
  if (form.startedAt && now - form.startedAt < minMs) return true;
  return false;
}
