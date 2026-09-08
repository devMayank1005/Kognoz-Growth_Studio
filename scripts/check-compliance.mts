/**
 * PRD §8 guard, run against the live schema.
 *
 * Stakeholder data is name, title, company, date, public source only. No email,
 * phone, address, or personal-social column may exist on any prospect-facing
 * table. Better Auth's own tables are exempt: user.email and session.ip_address
 * describe OUR operators signing in, not people we are prospecting.
 *
 * The pattern is IMPORTED from src/domain/zoho/forbidden.ts rather than written
 * out here. It used to be a second copy — a weaker one, matching only
 * `email|phone|mobile|address|linkedin|twitter|whatsapp`, so `e_mail`,
 * `Home_Phone`, `tel`, `msisdn`, `Mailing_Street` and `Mailing_Zip` (all real
 * Zoho field names, all caught by the unit tests) would have passed CI. The
 * module's own header claimed this file already imported it; now it does.
 *
 * Matching happens in JS, not in SQL. The pattern uses lookbehind, and pushing
 * it through Postgres `~*` would mean trusting ARE semantics to match
 * JavaScript's — so the query returns every column and the same RegExp object
 * the tests use decides. Views are included on purpose: information_schema
 * covers them, and a view is just as capable of exposing a contact column.
 *
 * Run in CI wherever DATABASE_URL is available. Exits non-zero on a violation.
 */
import { config } from "dotenv";
import pg from "pg";

import { CONTACT_SHAPED_KEY } from "../src/domain/zoho/forbidden";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const AUTH_TABLES = new Set([
  "user", "session", "account", "verification", "organization", "member", "invitation",
]);

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const { rows } = await client.query<{ table_name: string; column_name: string }>(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
  order by 1, 2
`);
await client.end();

const hits = rows.filter((r) => CONTACT_SHAPED_KEY.test(r.column_name));
const violations = hits.filter((r) => !AUTH_TABLES.has(r.table_name));

if (violations.length > 0) {
  console.error("PRD §8 violation — contact-shaped columns on prospect tables:\n");
  for (const v of violations) console.error(`  ${v.table_name}.${v.column_name}`);
  console.error("\nStakeholder data is name, title, company, date, public source only.");
  process.exit(1);
}

const exempt = hits.filter((r) => AUTH_TABLES.has(r.table_name));
console.log(`PRD §8 check passed — no contact columns on prospect tables (${rows.length} scanned).`);
console.log(`(${exempt.length} exempt columns on Better Auth tables: ${exempt.map((r) => `${r.table_name}.${r.column_name}`).join(", ")})`);
