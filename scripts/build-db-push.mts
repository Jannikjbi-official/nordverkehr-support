/**
 * Läuft beim Build (Vercel): Ist eine Datenbank verbunden, werden Schema und
 * Indizes per `prisma db push` angelegt bzw. aktualisiert (idempotent, MongoDB
 * kennt keine Migrationen). Ohne Datenbank-URL wird der Schritt übersprungen –
 * so baut das Projekt auch lokal und in CI ohne DB.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { findDatabaseUrlKey, resolveDatabaseUrl } from "../src/lib/db";

if (!findDatabaseUrlKey()) {
  console.log("[db] Keine Datenbank-URL gesetzt – Schema-Abgleich übersprungen.");
  process.exit(0);
}
if (process.env.SKIP_DB_PUSH === "true") {
  console.log("[db] SKIP_DB_PUSH=true – Schema-Abgleich übersprungen.");
  process.exit(0);
}
const url = resolveDatabaseUrl();
const dbName = url.match(/^mongodb(?:\+srv)?:\/\/[^/]+\/([^?]+)/)?.[1] ?? "?";
console.log(`[db] Schema-Abgleich für Datenbank „${dbName}“ …`);
const r = spawnSync("npx", ["prisma", "db", "push", "--skip-generate"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url, CHECKPOINT_DISABLE: "1" },
  shell: true,
});
process.exit(r.status ?? 1);
