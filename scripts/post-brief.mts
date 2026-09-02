/** Builds the morning brief from current data and posts it. No model call. */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const { db } = await import("../src/db/client");
const { organization } = await import("../src/db/schema");
const { loadPipeline, loadSignals, loadUniverse } = await import("../src/db/queries");
const { rankTargets } = await import("../src/domain/scoring");
const { buildMorningBrief } = await import("../src/engine/brief");
const { postBriefToOperators } = await import("../src/db/threads");

const [org] = await db.select({ id: organization.id }).from(organization).limit(1);
const [universe, signals, pipeline] = await Promise.all([loadUniverse(org.id), loadSignals(org.id), loadPipeline(org.id)]);
const targets = rankTargets({
  items: signals, universe,
  pipeline: pipeline.map((c) => ({ account: c.account, stage: c.stage })),
  history: signals,
});
const brief = buildMorningBrief({ targets, sweepCount: 11, failed: [] });
console.log("counts:", brief.counts);
console.log("text  :", brief.text);
console.log("chart :", brief.chart?.data.map((d) => `${d.name}=${d.value}`).join(" "));
console.log("rows  :", brief.rows.map((r) => `${r.company} (${r.solution})`).join(", "));
const posted = await postBriefToOperators(org.id, { text: brief.text, chart: brief.chart, rows: brief.rows });
console.log(`\nposted to ${posted} thread(s)`);
process.exit(0);
