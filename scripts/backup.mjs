/**
 * Backs up the Growth Studio database, and optionally proves the backup by
 * restoring it.
 *
 * WHY THIS EXISTS: the database was provisioned as a claimable Neon project
 * with a hard expiry. A verified dump removes that deadline — the project can
 * lapse and nothing is lost. It is equally the thing to run before a claim, a
 * region move, or any migration you are not sure about.
 *
 *   pnpm db:backup            dump only
 *   pnpm db:backup --verify   dump, then restore into a local scratch database
 *                             and compare row counts table by table
 *
 * A backup you have not restored is not a backup, so --verify is the point.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

// pg_dump must NOT go through Neon's pooler — it needs session state the
// pooler does not carry.
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED (or DATABASE_URL) is required.");
  process.exit(1);
}

const OUT_DIR = "backups";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
const base = path.join(OUT_DIR, `growth-studio-${stamp}`);
const dumpFile = `${base}.dump`;
const sqlFile = `${base}.sql`;

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

const run = (cmd, args) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] }).toString();

/* ------------------------------------------------------------------ dump */

console.log("Backing up Growth Studio\n");

try {
  // Custom format: compressed, and restores selectively.
  run("pg_dump", ["--no-owner", "--no-privileges", "-Fc", "-f", dumpFile, url]);
  // Plain SQL twin: readable, greppable, restorable by anything that speaks
  // Postgres even if pg_restore is unavailable.
  run("pg_dump", ["--no-owner", "--no-privileges", "-f", sqlFile, url]);
} catch (err) {
  console.error("pg_dump failed:\n", err.stderr?.toString() ?? err.message);
  console.error("\nIf this is a version mismatch, the local pg_dump must be >= the server version.");
  process.exit(1);
}

const kb = (f) => Math.round(statSync(f).size / 1024);
console.log(`  ${dumpFile}  ${kb(dumpFile)} KB`);
console.log(`  ${sqlFile}  ${kb(sqlFile)} KB`);

if (!process.argv.includes("--verify")) {
  console.log("\nDone. Run with --verify to prove it restores.");
  process.exit(0);
}

/* ---------------------------------------------------------------- verify */

const SCRATCH = "growth_studio_restore_check";
console.log(`\nVerifying by restoring into a local scratch database (${SCRATCH})…`);

/**
 * The table list is READ FROM THE DATABASE, never written here.
 *
 * It used to be a hardcoded array of 17 names against a schema of 24, and the
 * omissions were the interesting part: `conversations`, which
 * backups/README.md explicitly promises a restore recovers; `zoho_push_attempts`,
 * the only record of "we called Zoho and never learned the outcome", added in a
 * later migration and never added here; and `zoho_connections`, which holds the
 * encrypted refresh token. Meanwhile it still counted `threads`, the dead table
 * `conversations` replaced.
 *
 * The final line then printed "every table matches the live database", which was
 * not true and could not be, because a table missing from the list was never
 * queried at all. Enumerating means the script cannot fall behind the schema, and
 * comparing the two SETS catches the case a row count structurally cannot: a
 * table `pg_dump` did not carry.
 *
 * Same shape as scripts/check-compliance.mts, which queries information_schema
 * for the §8 column check. `BASE TABLE` excludes the `activity_log` view, whose
 * rows are not its own.
 */
const listTables = async (connection) => {
  const client = new pg.Client(connection);
  await client.connect();
  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_type = 'BASE TABLE'
      and table_name <> '__drizzle_migrations'
    order by table_name
  `);
  await client.end();
  return rows.map((r) => r.table_name);
};

const countRows = async (connection, tables) => {
  const client = new pg.Client(connection);
  await client.connect();
  const out = {};
  for (const t of tables) {
    try {
      const r = await client.query(`select count(*)::int n from "${t}"`);
      out[t] = r.rows[0].n;
    } catch {
      out[t] = null; // present in the catalogue but unreadable
    }
  }
  await client.end();
  return out;
};

const liveConnection = { connectionString: url };
const liveTables = await listTables(liveConnection);
const live = await countRows(liveConnection, liveTables);
console.log(`\n  ${liveTables.length} tables in the live database`);

const scratchConnection = { database: SCRATCH, host: "localhost" };

try {
  try { run("dropdb", ["--if-exists", SCRATCH]); } catch { /* fine */ }
  run("createdb", [SCRATCH]);
  // pg_restore reports benign notices on stderr; a non-zero exit is what matters.
  try {
    run("pg_restore", ["--no-owner", "--no-privileges", "-d", SCRATCH, dumpFile]);
  } catch (err) {
    const text = err.stderr?.toString() ?? "";
    if (/error:/i.test(text)) throw new Error(text);
  }

  const restoredTables = await listTables(scratchConnection);

  /**
   * The set comparison, before any counting.
   *
   * This is the check the hardcoded list could not perform at any length: a table
   * that exists live and did not survive the dump. A row count cannot see it,
   * because there is nothing on the restored side to count.
   */
  const missing = liveTables.filter((t) => !restoredTables.includes(t));
  const extra = restoredTables.filter((t) => !liveTables.includes(t));

  if (missing.length > 0) {
    console.error(`\nVERIFY FAILED — ${missing.length} table(s) did not survive the dump:`);
    for (const t of missing) console.error(`  ${t}`);
    process.exit(1);
  }
  if (extra.length > 0) {
    // Not fatal, but the dump and the live database disagree about the schema,
    // which is worth knowing before trusting either.
    console.warn(`\n  warning: ${extra.length} table(s) in the restore are absent live: ${extra.join(", ")}`);
  }

  const restored = await countRows(scratchConnection, liveTables);

  let mismatches = 0;
  console.log("\n  table                  live   restored");
  for (const t of liveTables) {
    const ok = live[t] === restored[t];
    if (!ok) mismatches++;
    console.log(`  ${t.padEnd(22)} ${String(live[t]).padStart(4)}   ${String(restored[t]).padStart(4)}  ${ok ? "" : "  <-- MISMATCH"}`);
  }

  // Row counts alone would pass on an empty-but-present table. Check that the
  // irreplaceable rows survived by CONTENT.
  const check = new pg.Client(scratchConnection);
  await check.connect();
  const sourced = await check.query(`select count(*)::int n from signals where url is not null and url <> ''`);
  const drafts = await check.query(`select subject from drafts limit 1`);
  // backups/README.md promises the morning brief is recoverable, and the table it
  // lives in was the one the old list forgot.
  const briefs = await check.query(`select count(*)::int n from conversations where kind = 'brief'`);
  await check.end();

  console.log(`\n  sourced signals restored : ${sourced.rows[0].n}`);
  console.log(`  a draft restored, intact : ${drafts.rows[0]?.subject ? `"${drafts.rows[0].subject}"` : "none found"}`);
  console.log(`  brief conversations      : ${briefs.rows[0].n}`);

  if (mismatches > 0) {
    console.error(`\nVERIFY FAILED — ${mismatches} table(s) do not match.`);
    process.exit(1);
  }

  /**
   * Leaves evidence. The dumps themselves are gitignored (they hold real email
   * addresses, PRD §8), so without this there is no record anywhere that a backup
   * was ever verified — docs/DEPLOY.md asserts one exists and nothing backs it.
   */
  const stamp =
    `Last verified: ${new Date().toISOString()}\n` +
    `Tables checked: ${liveTables.length}\n` +
    `Dump: ${path.basename(dumpFile)}\n\n` +
    `Written by scripts/backup.mjs --verify. The dumps are not tracked; this is.\n`;
  writeFileSync(path.join(path.dirname(dumpFile), "LAST-VERIFIED.md"), stamp);

  console.log(`\nVerified: the backup restores and all ${liveTables.length} tables match the live database.`);
} finally {
  try { run("dropdb", ["--if-exists", SCRATCH]); } catch { /* leave it */ }
}
