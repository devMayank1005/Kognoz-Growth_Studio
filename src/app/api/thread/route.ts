import { loadThread } from "@/db/threads";
import { getStudioSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 401, not a redirect: a Route Handler that redirects makes fetch follow it and
 *  hand the client HTML, which the caller then parses as JSON or SSE. */
const unauthorized = () =>
  Response.json({ error: "signed-out", message: "Your session has ended. Sign in again." }, { status: 401 });


/** Chat history, including the morning brief posted by the scheduled job. */
export async function GET() {
  const session = await getStudioSession();
  if (!session) return unauthorized();
  return Response.json({ turns: await loadThread(session.orgId, session.userId) });
}
