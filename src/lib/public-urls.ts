/**
 * Öffentliche Adressen, die auch im Browser gebraucht werden (ohne das Server-Env-Modul).
 */
export const MAIN_SITE = process.env.NEXT_PUBLIC_MAIN_SITE_URL ?? "https://nordverkehr.xyz";

/** Regelwerk – Standard: <Hauptseite>/regeln */
export const RULES_URL = process.env.NEXT_PUBLIC_RULES_URL ?? `${MAIN_SITE}/regeln`;

/** Bewerbungsportal (Navigation) */
export const BEWERBUNG_URL = process.env.NEXT_PUBLIC_BEWERBUNG_URL ?? "https://bewerbung.nordverkehr.xyz";

/** Impressum liegt auf der Hauptseite */
export const IMPRINT_URL = `${MAIN_SITE}/impressum`;

/** Quellcode (AGPL-3.0: Nutzer eines Netzwerkdienstes sollen den Code bekommen können) */
export const SOURCE_URL = "https://github.com/Jannikjbi-official/nordverkehr-support";

/** Hostname einer URL (Anzeige im Footer, erlaubte Links in KI-Entwürfen). */
export const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};
