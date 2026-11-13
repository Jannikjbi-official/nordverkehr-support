/**
 * Lokale MongoDB für die Entwicklung – als Replica Set (nötig für Transaktionen).
 * Lädt beim ersten Start einmalig ein mongod-Binary herunter.
 *
 *   npm run db:dev    →  mongodb://127.0.0.1:27018/nordverkehr_support?replicaSet=rs0&directConnection=true
 *
 * Port 27018, damit das Bewerbungsportal (27017) parallel laufen kann.
 * Daten bleiben in ./.mongo-data erhalten. Für Produktion: MongoDB Atlas.
 */
import { mkdirSync } from "node:fs";
import { MongoMemoryReplSet } from "mongodb-memory-server";

const dbPath = ".mongo-data";
mkdirSync(dbPath, { recursive: true });

const rs = await MongoMemoryReplSet.create({
  replSet: { name: "rs0", count: 1, storageEngine: "wiredTiger" },
  instanceOpts: [{ port: 27018, dbPath, storageEngine: "wiredTiger" }],
});
console.log("MongoDB (Replica Set rs0) läuft:", rs.getUri());
console.log('  DATABASE_URL="mongodb://127.0.0.1:27018/nordverkehr_support?replicaSet=rs0&directConnection=true"');
console.log("Beenden mit Strg+C");

const stop = async () => {
  await rs.stop({ doCleanup: false });
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
