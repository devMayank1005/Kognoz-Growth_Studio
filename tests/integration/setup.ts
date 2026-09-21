import { loadTestEnv } from "../env";

/**
 * Runs before the integration suite so `DATABASE_URL` comes from `.env.test`.
 *
 * Without this the suite would read whatever is already exported, which in a
 * shell that has sourced the real environment means seeding two throwaway orgs
 * into production.
 */
loadTestEnv();

if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  throw new Error(
    "The integration suite needs a database. Copy .env.test.example to .env.test and point it at a throwaway one.",
  );
}
