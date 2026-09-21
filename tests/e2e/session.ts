import { createHmac, randomBytes, randomUUID } from "node:crypto";

import pg from "pg";
import type { BrowserContext } from "@playwright/test";

import { loadTestEnv } from "../env";

loadTestEnv();

/**
 * Sign-in is Microsoft SSO only, so there is no password to automate.
 *
 * Tests therefore write a REAL session row and sign the cookie exactly the way
 * better-call does — `${token}.${base64(HMAC-SHA256(secret, token))}`, then
 * URI-encoded. The application has no bypass; only something holding the server
 * secret can mint one.
 */
export async function signIn(context: BrowserContext, email = "mayank@kognozconsulting.com") {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!url || !secret) throw new Error("DATABASE_URL and BETTER_AUTH_SECRET are required for E2E.");

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const { rows } = await client.query(`select id from "user" where email = $1`, [email]);
  if (!rows[0]) throw new Error(`No user ${email} — run pnpm db:seed and sign in once.`);

  const token = randomBytes(32).toString("base64url");
  await client.query(
    `insert into session (id, user_id, token, expires_at, created_at, updated_at)
     values ($1, $2, $3, $4, now(), now())`,
    [randomUUID(), rows[0].id, token, new Date(Date.now() + 60 * 60 * 1000)],
  );
  await client.end();

  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await context.addCookies([
    {
      name: "better-auth.session_token",
      value: encodeURIComponent(`${token}.${signature}`),
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Direct database access, for asserting what the UI claims actually landed. */
export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL });
  await client.connect();
  const r = await client.query(sql, params);
  await client.end();
  return r.rows as T[];
}
