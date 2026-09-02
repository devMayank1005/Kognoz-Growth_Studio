/**
 * Runs a single sweep against the live API and persists it.
 * Proves the path before the scheduler is built on top of it.
 *
 * Usage: pnpm tsx scripts/run-one-sweep.mts [sweepId]
 */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { db } = await import("../src/db/client");
const { organization } = await import("../src/db/schema");
const { loadUniverse } = await import("../src/db/queries");
const { persistSweep } = await import("../src/db/sweeps");
const { runSweep } = await import("../src/engine/sweeps");
const { makeSweeps } = await import("../prompts/sweeps");

const [org] = await db.select({ id: organization.id, name: organization.name }).from(organization).limit(1);
const universe = await loadUniverse(org.id);
const sweeps = makeSweeps(universe);

const wanted = process.argv[2] ?? "gulf";
const sweep = sweeps.find((s) => s.id === wanted) ?? sweeps[0];

console.log(`org: ${org.name}  universe: ${universe.length} accounts`);
console.log(`running sweep "${sweep.id}" — ${sweep.title}\n`);

const outcome = await runSweep(sweep);

console.log(`latency        ${(outcome.latencyMs / 1000).toFixed(1)}s`);
console.log(`error          ${outcome.error ?? "none"}`);
console.log(`kept           ${outcome.items.length}`);
console.log(`dropped        ${outcome.dropped.length}`);
for (const d of outcome.dropped) console.log(`   - ${d}`);
if (outcome.usage) console.log(`tokens         in=${outcome.usage.inputTokens} out=${outcome.usage.outputTokens} cacheRead=${outcome.usage.cacheReadTokens}`);

console.log("\nfindings:");
for (const i of outcome.items) {
  console.log(`  ${i.isNew ? "NEW " : "    "}${i.account.padEnd(28)} ${i.signal.padEnd(4)} t${i.tier} ${i.date}  ${i.headline}`);
  console.log(`       ${i.evidence.slice(0, 120)}`);
  console.log(`       ${i.url}`);
}

if (outcome.items.length) {
  const res = await persistSweep(org.id, outcome);
  console.log(`\npersisted: ${res.signalsWritten} signals, ${res.accountsDiscovered} new accounts (run ${res.sweepRunId})`);
} else {
  await persistSweep(org.id, outcome);
  console.log("\nnothing to persist — sweep run recorded with its errors");
}
process.exit(0);
