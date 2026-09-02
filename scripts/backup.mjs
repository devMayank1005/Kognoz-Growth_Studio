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
import { existsSync, mkdirSync, statSync } from "node:fs";
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

const TABLES = [
  "accounts", "signals", "opportunities", "activities", "drafts", "people",
  "threads", "sweep_runs", "model_calls", "user", "session", "account",
  "organization", "member", "partner_towers", "dnc", "settings",
];

const countRows = async (connection) => {
  const client = new pg.Client(connection);
  await client.connect();
  const out = {};
  for (const t of TABLES) {
    try {
      const r = await client.query(`select count(*)::int n from "${t}"`);
      out[t] = r.rows[0].n;
    } catch {
      out[t] = null; // table absent
    }
  }
  await client.end();
  return out;
};

const live = await countRows({ connectionString: url });

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

  const restored = await countRows({ database: SCRATCH, host: "localhost" });

  let mismatches = 0;
  console.log("\n  table              live   restored");
  for (const t of TABLES) {
    if (live[t] === null && restored[t] === null) continue;
    const ok = live[t] === restored[t];
    if (!ok) mismatches++;
    console.log(`  ${t.padEnd(18)} ${String(live[t]).padStart(4)}   ${String(restored[t]).padStart(4)}  ${ok ? "" : "  <-- MISMATCH"}`);
  }

  // Row counts alone would pass on an empty-but-present table. Check that the
  // irreplaceable rows survived by CONTENT.
  const check = new pg.Client({ database: SCRATCH, host: "localhost" });
  await check.connect();
  const sourced = await check.query(`select count(*)::int n from signals where url is not null and url <> ''`);
  const drafts = await check.query(`select subject from drafts limit 1`);
  await check.end();

  console.log(`\n  sourced signals restored : ${sourced.rows[0].n}`);
  console.log(`  a draft restored, intact : ${drafts.rows[0]?.subject ? `"${drafts.rows[0].subject}"` : "none found"}`);

  if (mismatches > 0) {
    console.error(`\nVERIFY FAILED — ${mismatches} table(s) do not match.`);
    process.exit(1);
  }
  console.log("\nVerified: the backup restores and every table matches the live database.");
} finally {
  try { run("dropdb", ["--if-exists", SCRATCH]); } catch { /* leave it */ }
}
