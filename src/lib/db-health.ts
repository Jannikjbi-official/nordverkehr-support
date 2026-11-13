/**
 * Datenbank-Check für die Verwaltung: Region (aus dem Hostnamen, ohne
 * Zugangsdaten) und Antwortzeit – liegt die DB weit weg von den Vercel-
 * Funktionen (Frankfurt), wird jede Seite spürbar langsamer.
 */
import { db, resolveDatabaseUrl } from "@/lib/db";

export function databaseRegion(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return host.match(/\.([a-z]{2}-[a-z]+-\d)\.(?:aws|azure|gcp)\.neon\.tech$/)?.[1] ?? (host === "127.0.0.1" || host === "localhost" ? "lokal" : null);
  } catch {
    return null;
  }
}

const NEAR_FRANKFURT = ["eu-central-1", "lokal"];

export async function databaseCheck(): Promise<{ label: string; ok: boolean; detail: string }> {
  try {
    const region = databaseRegion(resolveDatabaseUrl());
    await db.$queryRaw`SELECT 1`; // Verbindung aufwärmen
    const t0 = performance.now();
    await db.$queryRaw`SELECT 1`;
    const ms = Math.round(performance.now() - t0);
    const near = !region || NEAR_FRANKFURT.includes(region);
    return {
      label: "Datenbank",
      ok: near && ms < 60,
      detail: `${region ? `Region ${region}` : "Region unbekannt"} · Antwortzeit ${ms} ms${near ? "" : " – liegt nicht in Frankfurt (eu-central-1), Seiten werden langsamer"}`,
    };
  } catch (e) {
    return { label: "Datenbank", ok: false, detail: (e as Error).message.slice(0, 200) };
  }
}
