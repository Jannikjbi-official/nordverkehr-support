/**
 * Test-Datenbank für die Integrationstests:
 *  - TEST_DATABASE_URL gesetzt → eigenes, frisches Schema darin (wird danach gelöscht)
 *  - sonst → eingebettetes Postgres (npm-Paket embedded-postgres) in einem Temp-Ordner
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestDatabase {
  url: string;
  /** Aufräumen: Schema löschen bzw. eingebettetes Postgres stoppen */
  stop(dropSchema: (schema: string) => Promise<unknown>): Promise<void>;
}

export async function startTestDatabase(): Promise<TestDatabase> {
  const schema = `nvs_test_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const external = process.env.TEST_DATABASE_URL;
  if (external) {
    const u = new URL(external);
    u.searchParams.set("schema", schema);
    return { url: u.toString(), stop: async (dropSchema) => void (await dropSchema(schema)) };
  }

  const { default: EmbeddedPostgres } = await import("embedded-postgres");
  const dir = await mkdtemp(path.join(tmpdir(), "nvs-pg-"));
  const port = 55000 + Math.floor(Math.random() * 2000);
  const pg = new EmbeddedPostgres({ databaseDir: path.join(dir, "data"), user: "postgres", password: "postgres", port, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("nvs_test");
  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/nvs_test?schema=${schema}`,
    stop: async () => {
      await pg.stop().catch(() => {});
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    },
  };
}
