import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { loadDnc, loadPipeline, loadSignals, loadUniverse } from "@/db/queries";
import { organization, settings } from "@/db/schema";
import { persistSweep } from "@/db/sweeps";
import { postBriefToOperators } from "@/db/conversations";
import { rankTargets } from "@/domain/scoring";
import { buildMorningBrief } from "@/engine/brief";
import { logModelCall } from "@/engine/budget";
import { PROSE_MODEL } from "@/engine/client";
import { runSweep } from "@/engine/sweeps";
import { makeRadar, makeSweeps } from "../../prompts/sweeps";

import { SWEEP_EVENT, inngest } from "./client";
import { zohoCreateCard, zohoPushCard, zohoSyncAll } from "./zoho";

/**
 * The daily intelligence run (PRD §4.1).
 *
 * EACH SWEEP IS ITS OWN STEP, deliberately. Eleven web-searching model calls
 * take minutes and will not fit in one serverless invocation, and one failing
 * radar must not lose the other ten sweeps' findings. Durable steps give
 * per-sweep retry and partial results — which is what §11's "sweeps degrade
 * gracefully, partial results, visible errors" actually requires.
 */
interface SweepEvent {
  data: { orgId: string; by?: string };
}

/**
 * The cron's only job is to say WHICH orgs to sweep.
 *
 * Split out of `daily-sweep` so that function can require an org id instead of
 * guessing one. It used to guess: `select id from organization limit 1`, with no
 * ORDER BY and with `event.data.orgId` — which /api/sweeps/run has always sent —
 * never read. One org made that look correct. Two would have spent eleven Opus
 * calls researching org A's universe on org B's request, written the findings
 * into org A, and posted the brief to org A's operators, while org B's own
 * request was swallowed by a debounce it shared. A cross-tenant write that
 * nothing logged.
 *
 * Fanning out one event per org also means a failure sweeping one org does not
 * touch another's.
 */
export const dailySweepCron = inngest.createFunction(
  {
    id: "daily-sweep-cron",
    retries: 1,
    concurrency: { limit: 1 },
    // PRD §4.1: 05:30 local. The operator is in India.
    triggers: [{ cron: "TZ=Asia/Kolkata 30 5 * * *" }],
  },
  async ({ step }) => {
    const orgs = await step.run("list-orgs", async () => {
      // ORDER BY so the set is stable run to run; `limit 1` with no order was
      // the bug this function exists to remove.
      const rows = await db.select({ id: organization.id }).from(organization).orderBy(organization.id);
      if (rows.length === 0) throw new Error("no organization — run pnpm db:seed");
      return rows;
    });

    // Inside a step so a retry of this function does not re-send: Inngest
    // memoizes a completed step rather than re-running it.
    await step.run("fan-out", async () => {
      await inngest.send(
        orgs.map((org) => ({ name: SWEEP_EVENT, data: { orgId: org.id, by: "cron" } })),
      );
      return { sent: orgs.length };
    });

    return { orgs: orgs.length };
  },
);

export const dailySweep = inngest.createFunction(
  {
    id: "daily-sweep",
    retries: 1,
    /**
     * One run at a time PER ORG, and one every five minutes per org.
     *
     * /api/sweeps/run had no throttle and the palette had no in-flight guard, so
     * pressing ⌘K → "run the sweep again" N times launched N concurrent runs of
     * eleven Opus calls each, with up to five web searches per call.
     *
     * Both are keyed on the org now. Unkeyed, org B's request inside the window
     * was dropped because org A had just swept — the debounce silently enforced
     * one sweep per five minutes across the whole installation.
     *
     * Note this is a debounce, not a throttle: it DELAYS until the period passes
     * without a new event, so the 05:30 cron lands at 05:35. That is intended —
     * the brief is read hours later — but it is why there is no `timeout` here.
     */
    concurrency: [{ limit: 1, key: "event.data.orgId" }],
    debounce: { period: "5m", key: "event.data.orgId" },
    // Event only. The cron fires `dailySweepCron`, which sends one of these per org.
    triggers: [{ event: SWEEP_EVENT }],
  },
  async ({ event, step }: { event: SweepEvent; step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    const orgId = event.data.orgId;
    if (!orgId) throw new Error("sweep event carried no orgId — refusing to guess which tenant to sweep");
    const org = { id: orgId };

    /**
     * Refresh the USD -> INR rate before anything that might price a deal.
     *
     * Folded into this job rather than given its own cron: it is one number,
     * it shares this function's retry and single-flight guard, and a separate
     * schedule for it would be scaffolding. A failure is not fatal — the
     * previous rate stays, and its AGE is what surfaces the problem, because
     * `convertAmount` refuses once that age passes three days.
     */
    await step.run("refresh-fx", async () => {
      /**
       * Guarded, because the comment above has to be true.
       *
       * `refreshFxRate` swallows a failed FETCH, but its two database writes
       * are unguarded — and a Neon hiccup there would throw out of this step
       * and, with `retries: 1`, kill the whole job BEFORE a single sweep ran.
       * A rate that could not be refreshed is not a reason to skip the
       * morning's intelligence: `convertAmount` already refuses on a stale
       * rate, so nothing downstream trusts it blindly.
       */
      try {
        const { refreshFxRate } = await import("@/lib/fx");
        const result = await refreshFxRate(org.id);
        console.log(`[fx] ${result.status}${result.rate ? ` USD->INR ${result.rate}` : ""}`);
        return result;
      } catch (err) {
        console.error(`[fx] refresh failed, continuing: ${(err as Error).message}`);
        return { status: "unavailable" as const };
      }
    });

    const plan = await step.run("plan-sweeps", async () => {
      const universe = await loadUniverse(org.id);
      const [cfg] = await db
        .select({ markets: settings.radarMarkets })
        .from(settings)
        .where(eq(settings.orgId, org.id))
        .limit(1);
      return {
        sweeps: [...makeSweeps(universe), ...makeRadar(cfg?.markets ?? [], universe)],
      };
    });

    const failed: string[] = [];
    let found = 0;

    for (const sweep of plan.sweeps) {
      // One step per sweep: retried independently, and a thrown error here
      // does not abandon the sweeps that already succeeded.
      const result = await step.run(`sweep-${sweep.id}`, async () => {
        const outcome = await runSweep(sweep);
        await logModelCall({
          orgId: org.id,
          kind: `sweep:${sweep.kind}`,
          model: PROSE_MODEL,
          usage: outcome.usage,
          latencyMs: outcome.latencyMs,
          error: outcome.error,
        });
        const persisted = await persistSweep(org.id, outcome);
        return { title: sweep.title, error: outcome.error, written: persisted.signalsWritten };
      });

      if (result.error) failed.push(result.title);
      found += result.written;
    }

    // Precompute the brief so opening the app is a database read, not a model
    // call (PRD §4.4).
    const brief = await step.run("post-morning-brief", async () => {
      const [universe, sweepItems, pipeline, dnc] = await Promise.all([
        loadUniverse(org.id),
        loadSignals(org.id),
        loadPipeline(org.id),
        loadDnc(org.id),
      ]);
      const targets = rankTargets({
        items: sweepItems,
        universe,
        pipeline: pipeline.map((c) => ({ account: c.account, stage: c.stage })),
        history: sweepItems,
        // The brief puts its top six straight into an action table with ＋ Add
        // buttons. Without this, a blocked company was recommended as a door to
        // open first — the hard gate still refused the add, but §8 says DNC
        // disables every action, not just the last one.
        dnc,
      });
      const built = buildMorningBrief({ targets, sweepCount: plan.sweeps.length, failed });
      const posted = await postBriefToOperators(org.id, {
        text: built.text,
        chart: built.chart,
        rows: built.rows,
      });
      return { posted, triggers: built.counts.triggers };
    });

    return { sweeps: plan.sweeps.length, failed: failed.length, signalsWritten: found, brief };
  },
);

export const functions = [dailySweepCron, dailySweep, zohoCreateCard, zohoPushCard, zohoSyncAll];
