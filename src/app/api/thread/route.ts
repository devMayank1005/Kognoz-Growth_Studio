import { loadThread } from "@/db/threads";
import { requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Chat history, including the morning brief posted by the scheduled job. */
export async function GET() {
  const session = await requireSession();
  return Response.json({ turns: await loadThread(session.orgId, session.userId) });
}
