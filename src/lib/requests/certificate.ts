/**
 * Bescheide (PDF) für genehmigte Anträge – aktuell die Namensänderung.
 * Spieler laden den Bescheid im Portal herunter und geben ihn ingame im
 * Rathaus ab. Damit niemand einen Bescheid fälscht, trägt er einen Prüfcode
 * (HMAC), den das Rathaus unter /bescheid/pruefen nachschlagen kann.
 *
 * Wichtig: Das ist ein Ingame-Dokument (Roleplay), keine echte Urkunde – das
 * steht auch sichtbar auf jedem Bescheid.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { LOGO_PNG_BASE64 } from "@/lib/requests/logo-data";

/** Antragsarten, für die es nach Annahme einen Bescheid gibt */
export const CERTIFICATE_TYPE_SLUGS = ["namensaenderung"] as const;

export interface CertificateRequestLike {
  status: string;
  outcomeCategory: string | null;
  decidedAt: Date | null;
  type: { slug: string };
}

export function hasCertificate(r: CertificateRequestLike): boolean {
  return (
    (CERTIFICATE_TYPE_SLUGS as readonly string[]).includes(r.type.slug) &&
    (r.status === "DECIDED" || r.status === "ARCHIVED") &&
    r.outcomeCategory === "ACCEPTED" &&
    !!r.decidedAt
  );
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET fehlt – ohne ihn gibt es keine Prüfcodes.");
  return "dev-nur-lokal";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O, 1/I

/** Prüfcode, z. B. „K7Q2M-XH4PA“ – fest je Antrag, nicht erratbar */
export function verificationCode(requestId: string, key = secret()): string {
  const mac = createHmac("sha256", key).update(`bescheid:${requestId}`).digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

export function normalizeCode(input: string) {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : null;
}

export function codeMatches(requestId: string, input: string, key?: string) {
  const given = normalizeCode(input);
  if (!given) return false;
  const a = Buffer.from(verificationCode(requestId, key));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── PDF ──────────────────────────────────────────────────────

export interface NameChangeCertificate {
  publicId: string;
  submittedAt: Date;
  decidedAt: Date;
  currentName: string;
  newName: string;
  decidedBy: string;
  approvedBy?: string | null;
  code: string;
  verifyUrl: string;
}

const RED = rgb(0.769, 0.118, 0.118); // #c41e1e
const INK = rgb(0.1, 0.1, 0.11);
const MUTED = rgb(0.42, 0.42, 0.45);
const LINE = rgb(0.85, 0.85, 0.87);

const day = (d: Date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(d);

/** Standard-Schriften können nur WinAnsi – alles andere wird ersetzt statt abzustürzen */
function safeText(font: PDFFont, text: string) {
  const supported = new Set(font.getCharacterSet());
  return [...text.normalize("NFC")].map((ch) => (supported.has(ch.codePointAt(0)!) ? ch : "?")).join("");
}

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

export async function buildNameChangePdf(c: NameChangeCertificate): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Bescheid Namensänderung ${c.publicId}`);
  pdf.setAuthor("Nordverkehr Roleplay – Support-Center");
  pdf.setSubject("Ingame-Dokument (Roleplay) – keine amtliche Urkunde");
  pdf.setCreator("Nordverkehr Support-Center");
  pdf.setCreationDate(c.decidedAt);

  const page = pdf.addPage([595.28, 841.89]); // A4
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const logo = await pdf.embedPng(Buffer.from(LOGO_PNG_BASE64, "base64"));

  const M = 56; // Rand
  const W = page.getWidth() - 2 * M;
  let y = page.getHeight();

  const draw = (p: PDFPage, text: string, x: number, yy: number, font: PDFFont, size: number, color = INK) =>
    p.drawText(safeText(font, text), { x, y: yy, font, size, color });
  const rightAligned = (text: string, yy: number, font: PDFFont, size: number, color = INK) => {
    const t = safeText(font, text);
    page.drawText(t, { x: M + W - font.widthOfTextAtSize(t, size), y: yy, font, size, color });
  };
  const paragraph = (text: string, size = 11, font = regular, color = INK, gap = 5) => {
    for (const l of wrap(font, safeText(font, text), size, W)) {
      draw(page, l, M, y, font, size, color);
      y -= size + gap;
    }
  };

  // Kopf
  page.drawRectangle({ x: 0, y: y - 6, width: page.getWidth(), height: 6, color: RED });
  y -= 70;
  const logoH = 44;
  page.drawImage(logo, { x: M, y: y - 8, width: (logo.width / logo.height) * logoH, height: logoH });
  draw(page, "NORDVERKEHR ROLEPLAY", M + 50, y + 18, bold, 13);
  draw(page, "Support-Center · Antragswesen", M + 50, y + 2, regular, 9.5, MUTED);
  rightAligned(`Bescheid-Nr. ${c.publicId}`, y + 18, bold, 10);
  rightAligned(`Datum: ${day(c.decidedAt)}`, y + 2, regular, 9.5, MUTED);
  y -= 30;
  page.drawLine({ start: { x: M, y }, end: { x: M + W, y }, thickness: 0.8, color: LINE });

  // Titel
  y -= 52;
  draw(page, "BESCHEID", M, y, bold, 26, RED);
  y -= 22;
  draw(page, "über die Änderung des Namens (Charakter)", M, y, regular, 13);
  y -= 38;
  paragraph(`Dem Antrag vom ${day(c.submittedAt)} auf Änderung des Charakternamens wird stattgegeben.`, 11.5);
  y -= 16;

  // Namen
  const boxTop = y + 8;
  const rows: [string, string][] = [
    ["Bisheriger Name", c.currentName],
    ["Neuer Name", c.newName],
    ["Wirksam ab", day(c.decidedAt)],
  ];
  const boxH = rows.length * 30 + 20;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: W, height: boxH, color: rgb(0.975, 0.975, 0.98), borderColor: LINE, borderWidth: 0.8 });
  page.drawRectangle({ x: M, y: boxTop - boxH, width: 4, height: boxH, color: RED });
  y = boxTop - 30;
  for (const [label, value] of rows) {
    draw(page, label, M + 22, y, regular, 10, MUTED);
    const v = wrap(bold, safeText(bold, value), 14, W - 190)[0] ?? "";
    draw(page, v, M + 160, y - 1, bold, 14);
    y -= 30;
  }
  y = boxTop - boxH - 36;

  // Hinweis fürs Rathaus
  draw(page, "Hinweis für das Rathaus", M, y, bold, 12);
  y -= 20;
  paragraph(
    "Bitte legen Sie diesen Bescheid im Rathaus vor. Dort werden Personalausweis, Führerschein und weitere Papiere auf den neuen Namen ausgestellt. Die alten Papiere sind dabei abzugeben. Der Bescheid gilt nur zusammen mit dem Prüfcode unten.",
    10.5,
    regular,
    INK,
    4.5,
  );
  y -= 22;

  // Bearbeitung
  draw(page, "Bearbeitet von", M, y, regular, 10, MUTED);
  draw(page, c.approvedBy ? `${c.decidedBy} · bestätigt von ${c.approvedBy}` : c.decidedBy, M + 160, y, bold, 10.5);
  y -= 18;
  draw(page, "Entschieden am", M, y, regular, 10, MUTED);
  draw(page, day(c.decidedAt), M + 160, y, regular, 10.5);

  // Vermerk des Rathauses (wird ingame ausgefüllt)
  const ry = 232;
  page.drawRectangle({ x: M, y: ry, width: W, height: 70, borderColor: LINE, borderWidth: 0.8, borderDashArray: [4, 3] });
  draw(page, "VERMERK RATHAUS", M + 16, ry + 52, bold, 8.5, MUTED);
  draw(page, "Neue Papiere ausgestellt am", M + 16, ry + 18, regular, 9.5, MUTED);
  page.drawLine({ start: { x: M + 150, y: ry + 16 }, end: { x: M + W / 2 - 10, y: ry + 16 }, thickness: 0.6, color: MUTED });
  draw(page, "von", M + W / 2 + 6, ry + 18, regular, 9.5, MUTED);
  page.drawLine({ start: { x: M + W / 2 + 30, y: ry + 16 }, end: { x: M + W - 16, y: ry + 16 }, thickness: 0.6, color: MUTED });

  // Prüfcode
  const vy = 150;
  page.drawRectangle({ x: M, y: vy - 18, width: W, height: 64, borderColor: LINE, borderWidth: 0.8 });
  draw(page, "ECHTHEIT PRÜFEN", M + 16, vy + 26, bold, 8.5, MUTED);
  draw(page, c.code, M + 16, vy + 2, mono, 18);
  const urlLines = wrap(regular, safeText(regular, c.verifyUrl), 9, W / 2 - 10);
  urlLines.forEach((l, i) => draw(page, l, M + W / 2, vy + 18 - i * 12, regular, 9, MUTED));
  draw(page, `Bescheid-Nr. ${c.publicId} und Code eingeben`, M + W / 2, vy + 18 - urlLines.length * 12, regular, 9, MUTED);

  // Fuß
  page.drawLine({ start: { x: M, y: 92 }, end: { x: M + W, y: 92 }, thickness: 0.8, color: LINE });
  const foot = wrap(
    regular,
    "Ingame-Dokument für Nordverkehr Roleplay (GTA V / FiveM). Kein amtliches Dokument und keine echte Urkunde – gilt nur im Roleplay auf dem Nordverkehr-Server.",
    8.5,
    W,
  );
  foot.forEach((l, i) => draw(page, l, M, 76 - i * 11, regular, 8.5, MUTED));

  return pdf.save();
}

export function certificateFileName(publicId: string) {
  return `bescheid-namensaenderung-${publicId}.pdf`;
}
