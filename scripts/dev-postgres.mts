/**
 * Lokales Postgres für die Entwicklung – ohne Docker, ohne Installation
 * (npm-Paket embedded-postgres). Daten bleiben in `.data/postgres`.
 *
 *   npm run db:dev        → läuft, bis Strg+C
 *
 * Passende Zeile für .env:
 *   DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54329/nordverkehr_support"
 */
import { existsSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const dir = path.resolve(".data/postgres");
const port = Number(process.env.DEV_PG_PORT ?? 54329);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port, persistent: true, onLog: () => {} });

const fresh = !existsSync(path.join(dir, "PG_VERSION"));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("nordverkehr_support");
console.log(`Postgres läuft: postgresql://postgres:postgres@127.0.0.1:${port}/nordverkehr_support  (Strg+C zum Beenden)`);

const stop = async () => {
  await pg.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
