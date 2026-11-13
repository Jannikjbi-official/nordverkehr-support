/**
 * `npm run db:seed` – Basisdaten (Kategorien, Artikel, Antragsarten, Bausteine)
 * und, außer bei SEED_DEMO=false, Demo-Daten zum Ausprobieren (Dev-Login).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { resolveDatabaseUrl } from "../src/lib/db";
import { ensureBaseData } from "../src/lib/setup/base-seed";
import { seedDemo } from "../src/lib/setup/demo";

async function main() {
  const db = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() });
  const log = (m: string) => console.log("[seed]", m);
  try {
    await ensureBaseData(db, log);
    if (process.env.SEED_DEMO !== "false") await seedDemo(db, log);
    log("Fertig.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
