import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { inngest, ZOHO_SYNC_ALL_EVENT } from "@/inngest/client";
import { getStudioSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * "Push now" (PRD §6).
 *
 * Sends the event and returns — it does not await the run, so the button never
 * hangs on eleven network calls. The same shape as `/api/sweeps/run`.
 */
export async function POST() {
  const session = await getStudioSession();
  if (!session) {
    // 401, never a redirect: fetch would follow it and hand the client HTML.
    return Response.json(
      { error: "signed-out", message: "Your session has ended. Sign in again." },
      { status: 401 },
    );
  }

  try {
    await inngest.send({
      name: ZOHO_SYNC_ALL_EVENT,
      data: { orgId: session.orgId, by: session.userId },
    });
  } catch (err) {
    // An unreachable queue is a 200 with `ok: false`, not a 500: the caller
    // parses JSON, and an HTML error page would surface as "could not reach the
    // server" — true of the queue, misleading about the app.
    console.error("[zoho] could not queue the push:", (err as Error).message);
    return Response.json({
      ok: false,
      message: "The job queue did not answer. Nothing was pushed — try again in a moment.",
    });
  }

  /**
   * The mode has to reach the operator.
   *
   * In dry run nothing is written, so the Zoho column never changes — which
   * from the outside is indistinguishable from the dead button this whole leg
   * exists to replace. A success toast promising cards will land, followed by
   * nothing landing, is the same lie one step further along.
   */
  const [cfg] = await db
    .select({ dryRun: settings.zohoDryRun })
    .from(settings)
    .where(eq(settings.orgId, session.orgId))
    .limit(1);

  return Response.json({
    ok: true,
    dryRun: cfg?.dryRun !== false,
    message:
      cfg?.dryRun !== false
        ? "Dry run — nothing is written to Zoho"
        : "Pushing to Zoho. Cards update as they land.",
  });
}
