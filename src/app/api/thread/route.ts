import { defaultConversationId, loadConversation } from "@/db/conversations";
import { getStudioSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** 401, not a redirect: a Route Handler that redirects makes fetch follow it and
 *  hand the client HTML, which the caller then parses as JSON or SSE. */
const unauthorized = () =>
  Response.json({ error: "signed-out", message: "Your session has ended. Sign in again." }, { status: 401 });

/**
 * One conversation's history, including the morning brief posted by the
 * scheduled job. `?c=` names it; without one the default is used, which is the
 * pinned brief when the operator has it.
 */
export async function GET(request: Request) {
  const session = await getStudioSession();
  if (!session) return unauthorized();

  const wanted = new URL(request.url).searchParams.get("c");
  const id = wanted ?? (await defaultConversationId(session.orgId, session.userId));
  if (!id) return Response.json({ turns: [] });

  // Scoped to the session's user, so another operator's id resolves to nothing.
  const conversation = await loadConversation(session.orgId, session.userId, id);
  return Response.json({ turns: conversation?.turns ?? [] });
}
