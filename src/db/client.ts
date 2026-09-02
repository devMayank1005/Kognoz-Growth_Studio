import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
}

/**
 * Neon's HTTP driver over drizzle. Connection is lazy — nothing opens until a
 * query runs — which suits serverless invocations.
 */
export const db = drizzle({ client: neon(connectionString), schema });

export type Db = typeof db;
