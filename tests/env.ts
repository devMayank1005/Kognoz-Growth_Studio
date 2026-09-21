import { existsSync } from "node:fs";

import { config } from "dotenv";

/**
 * Loads `.env.test` when it exists, and only then falls back to `.env.local`.
 *
 * The fallback is the part worth explaining. `.env.local` is the REAL Neon
 * connection, and the E2E suite writes to whatever it is pointed at: it inserts a
 * genuine `session` row for a real user and, in the kanban test, moves a live
 * opportunity to "Meeting set" and asserts against the database. Nothing restored
 * it. `playwright.config.ts` even said it would not start a server *because* it
 * needed `.env.local` — so `pnpm test:e2e` was a production write, and
 * `fullyParallel: false // these share one database` was the tell.
 *
 * So: put the test database in `.env.test` and it is used in preference,
 * everywhere, with no per-suite wiring to forget. The fallback stays because
 * removing it would break the suite for anyone who has not made one yet — but it
 * announces itself, loudly, every run.
 */
export function loadTestEnv(): "test" | "local" {
  if (existsSync(".env.test")) {
    config({ path: ".env.test", quiet: true });
    return "test";
  }

  config({ path: ".env.local", quiet: true });
  console.warn(
    "\n  ⚠  No .env.test found — falling back to .env.local.\n" +
      "     These tests WRITE to whatever database that points at.\n" +
      "     Copy .env.test.example and point it at a throwaway database.\n",
  );
  return "local";
}
