/**
 * Läuft beim Build (Vercel): Ist eine Postgres-Datenbank verbunden, werden
 * Tabellen und Indizes per `prisma db push` angelegt bzw. aktualisiert
 * (über die direkte Verbindung ohne Pooler). Ohne Datenbank-URL wird der
 * Schritt übersprungen – so baut das Projekt auch lokal und in CI ohne DB.
 *
 * Würde eine Änderung Daten löschen, bricht `db push` ab (kein
 * --accept-data-loss) – dann bewusst per `npm run db:push -- --accept-data-loss`.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { findDatabaseUrlKey, resolveDirectUrl } from "../src/lib/db";
import { ensureBaseDataOnce } from "../src/lib/setup/base-seed";

if (!findDatabaseUrlKey()) {
  console.log("[db] Keine Postgres-URL gesetzt – Schema-Abgleich übersprungen.");
  process.exit(0);
}
if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[db] SKIP_DB_PUSH=true – Schema-Abgleich übersprungen.");
  process.exit(0);
}
const url = resolveDirectUrl();
console.log(`[db] Schema-Abgleich für ${new URL(url).hostname} …`);
const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: "1" },
  shell: true,
});
if (r.status !== 0) process.exit(r.status ?? 1);

// Basisdaten (Kategorien, Artikel, Antragsarten, Bausteine) hier beim Build
// anlegen bzw. ergänzen – zur Laufzeit gibt es dafür keine Prüfung.
const { db } = await import("../src/lib/db");
await ensureBaseDataOnce(db, (m) => console.log("[db]", m));
await db.$disconnect();
process.exit(0);
