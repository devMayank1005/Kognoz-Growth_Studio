import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next loads .env.local automatically; drizzle-kit runs outside Next, so load
// it explicitly. .env.local wins, .env is the fallback.
config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle",
  // Direct, non-pooled endpoint. Neon's guidance: DDL and session state must
  // not go through the pooler. Falls back to DATABASE_URL for local Postgres.
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL! },
  strict: true,
  verbose: true,
});
