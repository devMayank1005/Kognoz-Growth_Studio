/**
 * Guards against Better Auth schema drift.
 *
 * WHY: @better-auth/cli lags the better-auth runtime (CLI tops out at
 * 1.5.0-beta while the runtime is 1.7.2), so `cli generate` silently omits
 * fields the runtime requires. That is not a theoretical risk — it cost a
 * broken Microsoft sign-in that only surfaced on the first real OAuth
 * callback, as "The field \"issuer\" does not exist in the schema".
 *
 * This asks the RUNTIME what fields it needs and compares against the live
 * database, so the next version bump fails here instead of at a user's
 * first sign-in.
 *
 * Run in CI wherever DATABASE_URL is available. Exits non-zero on drift.
 */
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const { getAuthTables } = await import("better-auth/db");
const { organization } = await import("better-auth/plugins");

// Must mirror src/lib/auth.ts — the plugins and providers in use change which
// fields the runtime expects.
const tables = getAuthTables({
  socialProviders: { microsoft: { clientId: "x", clientSecret: "y" } },
  plugins: [organization({ allowUserToCreateOrganization: false })],
});

const snake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);

const client = new pg.Client({ connectionString: url });
await client.connect();

const problems = [];
for (const [model, def] of Object.entries(tables)) {
  const table = def.modelName ?? model;
  const { rows } = await client.query(
    `select column_name from information_schema.columns where table_schema='public' and table_name=$1`,
    [table],
  );
  const live = new Set(rows.map((r) => r.column_name));
  if (live.size === 0) {
    problems.push(`table "${table}" is missing entirely`);
    continue;
  }
  for (const field of Object.keys(def.fields)) {
    if (!live.has(snake(field))) problems.push(`${table}.${snake(field)} (runtime field "${field}") is missing`);
  }
}
await client.end();

if (problems.length) {
  console.error("Better Auth schema drift — the runtime expects fields the database does not have:\n");
  for (const p of problems) console.error(`  ${p}`);
  console.error("\nAdd them to src/db/schema/auth.ts, then pnpm db:generate && pnpm db:migrate.");
  process.exit(1);
}

const count = Object.values(tables).reduce((n, d) => n + Object.keys(d.fields).length, 0);
console.log(`Better Auth schema check passed — ${Object.keys(tables).length} models, ${count} fields all present.`);
