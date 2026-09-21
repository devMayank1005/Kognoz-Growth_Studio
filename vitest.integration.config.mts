import { defineConfig } from "vitest/config";

/**
 * A separate project because these tests need a database.
 *
 * `pnpm test` stays pure and offline — that is enforced for src/domain by an
 * eslint rule and is worth keeping for the whole unit suite, since it is what
 * makes it runnable anywhere in about a second. These run against a real
 * Postgres and are wired to `pnpm test:integration`.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "@": new URL("./src/", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    // Same .env.test preference as the E2E suite, so neither can write to real
    // data by default. See tests/env.ts.
    setupFiles: ["tests/integration/setup.ts"],
    // One database, shared. Parallel files would race on the fixtures.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
