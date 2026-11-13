/**
 * Läuft einmal pro Serverstart (auf Vercel bei jedem Kaltstart).
 * Leere Datenbank → Basisdaten anlegen (Kategorien, Artikel, Antragsarten,
 * Bausteine – ohne Demo-Daten). Sonst kostet das zwei kleine Abfragen.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { findDatabaseUrlKey } = await import("@/lib/db");
  if (!findDatabaseUrlKey()) return;
  try {
    const { db } = await import("@/lib/db");
    const { ensureBaseDataOnce } = await import("@/lib/setup/base-seed");
    await ensureBaseDataOnce(db);
  } catch (e) {
    // Start nie blockieren
    console.error("[setup] Ersteinrichtung fehlgeschlagen", e);
  }
}
