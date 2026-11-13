import { Prisma, PrismaClient } from "@prisma/client";
import { channelsForMutation, notifyChanged } from "@/lib/realtime";

/**
 * Eine PrismaClient-Instanz pro Prozess (auch über Hot-Reloads hinweg).
 * Wird lazy erzeugt, damit `next build` ohne Datenbank durchläuft.
 * Datenbank: PostgreSQL (z. B. Neon über die Vercel-Integration).
 */
const globalForPrisma = globalThis as unknown as { __nvsPrisma?: PrismaClient };

type Env = Record<string, string | undefined>;

const isPostgresUrl = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//i.test(v.trim());

/** Laufzeit-Verbindung (gepoolt), in dieser Reihenfolge. Neon/Vercel legen je nach Präfix eigene Namen an. */
export const DATABASE_URL_KEYS = ["DATABASE_URL", "DATABASE_POSTGRES_PRISMA_URL", "POSTGRES_PRISMA_URL", "DATABASE_POSTGRES_URL", "POSTGRES_URL"] as const;
/** Direkte Verbindung (ohne Pooler) – für Schema-Änderungen per `prisma db push`. */
export const DIRECT_URL_KEYS = ["DATABASE_URL_UNPOOLED", "DATABASE_POSTGRES_URL_NON_POOLING", "POSTGRES_URL_NON_POOLING", "DIRECT_URL"] as const;

function findKey(env: Env, known: readonly string[], suffixes: string[]): string | null {
  for (const key of known) if (isPostgresUrl(env[key])) return key;
  // Integration mit eigenem Präfix, z. B. STORAGE_POSTGRES_PRISMA_URL
  for (const suffix of suffixes) {
    const key = Object.keys(env).sort().find((k) => k.endsWith(suffix) && isPostgresUrl(env[k]));
    if (key) return key;
  }
  return null;
}

/** Name der Variable mit der (gepoolten) Postgres-Verbindung – andere Datenbanken (z. B. alte MongoDB-URL) werden ignoriert. */
export function findDatabaseUrlKey(env: Env = process.env): string | null {
  return findKey(env, DATABASE_URL_KEYS, ["_POSTGRES_PRISMA_URL", "_DATABASE_URL", "_POSTGRES_URL"]);
}

export function findDirectUrlKey(env: Env = process.env): string | null {
  return findKey(env, DIRECT_URL_KEYS, ["_URL_UNPOOLED", "_POSTGRES_URL_NON_POOLING"]);
}

/**
 * Neon schläft im Free-Plan nach ein paar Minuten ein; das Aufwachen kann
 * länger dauern als Prismas Standard-Timeout (5 s) – daher großzügiger.
 */
export function withConnectOptions(url: string): string {
  const u = new URL(url);
  if (!u.searchParams.has("connect_timeout")) u.searchParams.set("connect_timeout", "15");
  return u.toString();
}

/** Verbindung für die App (gepoolt). */
export function resolveDatabaseUrl(env: Env = process.env): string {
  const key = findDatabaseUrlKey(env);
  if (!key) throw new Error(`Keine Postgres-Datenbank-URL gesetzt (${DATABASE_URL_KEYS.join(" / ")}).`);
  return withConnectOptions(env[key]!.trim());
}

/** Verbindung für Schema-Änderungen: direkt, sonst die normale. */
export function resolveDirectUrl(env: Env = process.env): string {
  const key = findDirectUrlKey(env);
  return key ? withConnectOptions(env[key]!.trim()) : resolveDatabaseUrl(env);
}

// Postgres lehnt NUL-Zeichen in Texten ab – aus Eingaben still entfernen statt mit Fehler abzubrechen.
function stripNul<T>(value: T): T {
  if (typeof value === "string") return (value.includes("\u0000") ? value.replaceAll("\u0000", "") : value) as T;
  if (Array.isArray(value)) return value.map(stripNul) as T;
  if (value && typeof value === "object" && !(value instanceof Date) && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, stripNul(v)])) as T;
  }
  return value;
}

const noNulBytes = Prisma.defineExtension({
  name: "no-nul-bytes",
  query: {
    $allModels: {
      $allOperations({ operation, args, query }) {
        if (["create", "createMany", "update", "updateMany", "upsert"].includes(operation) && args && typeof args === "object") {
          const a = args as Record<string, unknown>;
          for (const k of ["data", "create", "update"]) if (k in a) a[k] = stripNul(a[k]);
        }
        return query(args);
      },
    },
  },
});

/** Nach Schreibzugriffen auf Tickets/Anträge ein Live-Signal senden (siehe realtime.ts) */
const realtimeSignals = Prisma.defineExtension({
  name: "realtime-signals",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const result = await query(args);
        try {
          notifyChanged(channelsForMutation(model, operation, args as Record<string, unknown>, result));
        } catch {
          // Live-Signale sind ein Extra – nie den eigentlichen Vorgang stören
        }
        return result;
      },
    },
  },
});

export function getDb(): PrismaClient {
  if (!globalForPrisma.__nvsPrisma) {
    // Query-Extension ändert keine Typen – der Cast ist sicher
    globalForPrisma.__nvsPrisma = new PrismaClient({ datasourceUrl: resolveDatabaseUrl() }).$extends(noNulBytes).$extends(realtimeSignals) as unknown as PrismaClient;
    // Ersteinrichtung (leere DB bzw. neue Standard-Artikel) einmal pro Instanz –
    // im Hintergrund, die erste Anfrage wartet nicht darauf.
    const client = globalForPrisma.__nvsPrisma;
    if (process.env.NEXT_PHASE !== "phase-production-build" && process.env.VITEST !== "true") {
      void import("@/lib/setup/base-seed")
        .then(({ ensureBaseDataOnce }) => ensureBaseDataOnce(client))
        .catch((e) => console.error("[setup] Ersteinrichtung fehlgeschlagen", e));
    }
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
