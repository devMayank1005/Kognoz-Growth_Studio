import { defineConfig, devices } from "@playwright/test";

/**
 * E2E against a running dev server on 3001.
 *
 * Deliberately NOT starting the server here: it needs .env.local (a real Neon
 * connection and API key), so a webServer block would either duplicate that
 * config or fail confusingly. Start it with `pnpm dev` and run these against it.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false, // these share one database
  workers: 1,
  reporter: [["list"]],
  timeout: 45_000,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    // Acceptance #10 is explicit about 390px, so it is a real viewport here.
    { name: "mobile-390", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, isMobile: false } },
  ],
});
