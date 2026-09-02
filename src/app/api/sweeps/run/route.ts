import { inngest } from "@/inngest/client";
import { SWEEP_EVENT } from "@/inngest/client";
import { requireSession } from "@/lib/session";

/** Manual trigger behind "run the sweep again" (PRD §4.4). */
export async function POST() {
  const session = await requireSession();
  await inngest.send({ name: SWEEP_EVENT, data: { orgId: session.orgId, by: session.userId } });
  return Response.json({ ok: true, message: "Sweep started. Findings will land as they are found." });
}
