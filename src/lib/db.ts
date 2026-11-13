import { PrismaClient } from "@prisma/client";
import { explicitNulls } from "@/lib/db-nulls";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: MongoDB (Replica Set, z. B. MongoDB Atlas) über DATABASE_URL
 * (oder die Variable der Vercel-Atlas-Integration, siehe resolveDatabaseUrl).
 */
const globalForPrisma = globalThis as unknown as { __nvsPrisma?: PrismaClient };

export const DEFAULT_DB_NAME = "nordverkehr_support";

/**
 * Prisma braucht einen Datenbanknamen im Connection String. Die Vercel-Atlas-
 * Integration liefert oft `…mongodb.net/?retryWrites=true` ohne Namen –
 * dann wird `nordverkehr_support` ergänzt.
 */
export function withDatabaseName(url: string, name = DEFAULT_DB_NAME, force = false): string {
  const match = url.match(/^(mongodb(?:\+srv)?:\/\/[^/?#]+)(\/[^?#]*)?(\?[^#]*)?(#.*)?$/);
  if (!match) return url;
  const [, base, path, query = ""] = match;
  if (path && path !== "/" && !force) return url;
  return `${base}/${name}${query}`;
}

/** Variablennamen, unter denen die Verbindung stehen darf (Vercel-Atlas-Integration legt eigene an). */
export const DATABASE_URL_KEYS = ["DATABASE_URL", "DATABASE_URL_MONGODB_URI", "MONGODB_URI"] as const;

/** Verbindungs-URL finden und um den Datenbanknamen ergänzen. */
export function resolveDatabaseUrl(env: Record<string, string | undefined> = process.env): string {
  for (const key of DATABASE_URL_KEYS) {
    const v = env[key];
    // DATABASE_NAME erzwingt die eigene Datenbank – so kann dieselbe Atlas-Verbindung
    // wie beim Bewerbungsportal genutzt werden, ohne dessen Datenbank zu teilen.
    const forced = env.DATABASE_NAME?.trim();
    if (v && v.trim()) return withDatabaseName(v.trim(), forced || DEFAULT_DB_NAME, !!forced);
  }
  throw new Error(`Keine Datenbank-URL gesetzt (${DATABASE_URL_KEYS.join(" / ")}).`);
}

export function getDb(): PrismaClient {
  if (!globalForPrisma.__nvsPrisma) {
    // Query-Extension ändert keine Typen – der Cast ist sicher (siehe db-nulls.ts)
    globalForPrisma.__nvsPrisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() }).$extends(explicitNulls) as unknown as PrismaClient;
  }
  return globalForPrisma.__nvsPrisma;
}

/** Proxy, damit überall `db.user.findMany()` geschrieben werden kann. */
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export type Db = PrismaClient;
