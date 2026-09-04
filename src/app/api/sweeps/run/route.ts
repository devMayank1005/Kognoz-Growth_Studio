import { inngest } from "@/inngest/client";
import { SWEEP_EVENT } from "@/inngest/client";
import { getStudioSession } from "@/lib/session";

/** 401, not a redirect: a Route Handler that redirects makes fetch follow it and
 *  hand the client HTML, which the caller then parses as JSON or SSE. */
const unauthorized = () =>
  Response.json({ error: "signed-out", message: "Your session has ended. Sign in again." }, { status: 401 });


/** Manual trigger behind "run the sweep again" (PRD §4.4). */
export async function POST() {
  const session = await getStudioSession();
  if (!session) return unauthorized();
  await inngest.send({ name: SWEEP_EVENT, data: { orgId: session.orgId, by: session.userId } });
  return Response.json({ ok: true, message: "Sweep started. Findings will land as they are found." });
}
