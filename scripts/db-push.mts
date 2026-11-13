/**
 * `prisma db push` (Schema + Indizes). Ergänzt den Datenbanknamen im
 * Connection String, falls er fehlt (z. B. bei der Vercel-Atlas-Integration).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolveDatabaseUrl } from "../src/lib/db";

let url: string;
try {
  url = resolveDatabaseUrl();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const env = { ...process.env, DATABASE_URL: url };
const r = spawnSync("npx", ["prisma", "db", "push", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
process.exit(r.status ?? 1);
