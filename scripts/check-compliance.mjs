/**
 * PRD §8 guard, run against the live schema.
 *
 * Stakeholder data is name, title, company, date, public source only. No email,
 * phone, address, or personal-social column may exist on any prospect-facing
 * table. Better Auth's own tables are exempt: user.email and session.ip_address
 * describe OUR operators signing in, not people we are prospecting.
 *
 * Run in CI wherever DATABASE_URL is available. Exits non-zero on a violation.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

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

const { rows } = await client.query(`
  select table_name, column_name
  from information_schema.columns
  where table_schema = 'public'
    and column_name ~* 'email|phone|mobile|address|linkedin|twitter|whatsapp'
  order by 1, 2
`);
await client.end();

const violations = rows.filter((r) => !AUTH_TABLES.has(r.table_name));

if (violations.length > 0) {
  console.error("PRD §8 violation — contact-shaped columns on prospect tables:\n");
  for (const v of violations) console.error(`  ${v.table_name}.${v.column_name}`);
  console.error("\nStakeholder data is name, title, company, date, public source only.");
  process.exit(1);
}

const exempt = rows.filter((r) => AUTH_TABLES.has(r.table_name));
console.log("PRD §8 check passed — no contact columns on prospect tables.");
console.log(`(${exempt.length} exempt columns on Better Auth tables: ${exempt.map((r) => `${r.table_name}.${r.column_name}`).join(", ")})`);
