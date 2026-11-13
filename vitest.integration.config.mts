import { defineConfig } from "vitest/config";
import path from "node:path";

/** Integrationstests gegen eine echte MongoDB (mongodb-memory-server). */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 240_000,
    fileParallelism: false,
  },
});
