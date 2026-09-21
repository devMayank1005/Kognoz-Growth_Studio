import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Proof that the policies in drizzle/0018 actually deny.
 *
 * Deliberately NOT through the app's `db` client: that connects as the owner,
 * which has rolbypassrls and would sail through every policy — which is exactly
 * the state CLAUDE.md recorded on 2026-09-04 and the reason a GUC nobody read
 * looked like protection. These tests `SET ROLE growth_app`, the NOBYPASSRLS role
 * the migration creates, so the policy is what decides.
 *
 * This is the half that makes RLS real rather than aspirational. The other half —
 * pointing DATABASE_URL at that role — is not done, and must not be until the
 * read path runs inside a transaction: the fifth test below is why.
 */

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
let client: Client;
const a = `rls-a-${randomUUID().slice(0, 8)}`;
const b = `rls-b-${randomUUID().slice(0, 8)}`;

/** Runs a query as growth_app, optionally with app.org_id set. */
async function asApp<T = Record<string, unknown>>(orgId: string | null, sql: string): Promise<T[]> {
  await client.query("begin");
  try {
    await client.query("set local role growth_app");
    if (orgId) await client.query("select set_config('app.org_id', $1, true)", [orgId]);
    const result = await client.query(sql);
    return result.rows as T[];
  } finally {
    await client.query("rollback");
  }
}

beforeAll(async () => {
  if (!url) throw new Error("DATABASE_URL is required for the integration suite");
  client = new Client({ connectionString: url });
  await client.connect();
  await client.query(
    `insert into organization (id, name, slug, created_at) values ($1,'A',$1,now()), ($2,'B',$2,now())`,
    [a, b],
  );
  await client.query(
    `insert into accounts (org_id, name) values ($1,'A-only Acme'), ($2,'B-only Globex')`,
    [a, b],
  );
}, 30_000);

afterAll(async () => {
  if (!client) return;
  await client.query("delete from organization where id = any($1)", [[a, b]]);
  await client.end();
});

describe("row-level security", () => {
  it("is enabled on every org-scoped table", async () => {
    const { rows } = await client.query<{ relname: string }>(`
      select c.relname from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
        and exists (
          select 1 from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'org_id'
        )
    `);
    // A new org-scoped table with no policy is the hole this closes.
    expect(rows.map((r) => r.relname)).toEqual([]);
  });

  it("the application role cannot bypass it", async () => {
    const { rows } = await client.query<{ rolbypassrls: boolean }>(
      "select rolbypassrls from pg_roles where rolname = 'growth_app'",
    );
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  it("shows org A only org A's rows", async () => {
    const rows = await asApp<{ name: string }>(a, "select name from accounts order by name");
    expect(rows.map((r) => r.name)).toEqual(["A-only Acme"]);
  });

  it("shows org B only org B's rows", async () => {
    const rows = await asApp<{ name: string }>(b, "select name from accounts order by name");
    expect(rows.map((r) => r.name)).toEqual(["B-only Globex"]);
  });

  it("returns NOTHING when app.org_id is unset — which is why the read path must move first", async () => {
    // current_setting('app.org_id', true) is NULL outside withOrg, and
    // `org_id = NULL` is never true. Failing closed is correct, and it is also
    // the reason DATABASE_URL still points at the owner: reads go direct today,
    // so flipping the role without moving them would empty every page.
    const rows = await asApp(null, "select name from accounts");
    expect(rows).toEqual([]);
  });

  it("refuses a write into another org even with a valid session", async () => {
    await expect(
      asApp(a, `insert into accounts (org_id, name) values ('${b}', 'smuggled')`),
    ).rejects.toThrow(/row-level security/i);
  });

  it("protects people, which has no org_id of its own", async () => {
    const [account] = await client.query<{ id: string }>(
      "select id from accounts where org_id = $1", [a],
    ).then((r) => r.rows);
    // `source` is NOT NULL: §8 requires the public URL a name was read from, so
    // there is no way to store a person without saying where they came from.
    await client.query(
      "insert into people (account_id, name, role, source) values ($1, 'A-only Person', 'CHRO', 'https://example.com/board')",
      [account.id],
    );
    // §8 keeps `people` narrow, so its policy goes through the account.
    const seenByA = await asApp<{ name: string }>(a, "select name from people order by name");
    const seenByB = await asApp<{ name: string }>(b, "select name from people order by name");
    expect(seenByA.map((r) => r.name)).toContain("A-only Person");
    expect(seenByB.map((r) => r.name)).not.toContain("A-only Person");
  });

  it("leaves Better Auth's tables unrestricted, so a session can still resolve", async () => {
    // resolveStudioSession reads member and organization to discover WHICH org a
    // request belongs to, before any org is known. A policy there would make
    // every sign-in resolve to nothing.
    const rows = await asApp(null, "select 1 from organization limit 1");
    expect(rows.length).toBe(1);
  });
});
