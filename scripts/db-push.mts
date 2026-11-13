/**
 * `prisma db push` (Tabellen + Indizes) über die direkte Verbindung.
 * Weitere Argumente werden durchgereicht, z. B. `npm run db:push -- --accept-data-loss`.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { resolveDirectUrl } from "../src/lib/db";

let url: string;
try {
  url = resolveDirectUrl();
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
const r = spawnSync("npx", ["prisma", "db", "push", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url }, shell: true });
process.exit(r.status ?? 1);
