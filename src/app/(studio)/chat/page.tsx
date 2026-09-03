import { Suspense } from "react";

import { loadThread } from "@/db/threads";
import { Chat } from "@/components/studio/chat";
import { requireSession } from "@/lib/session";

export default async function ChatPage() {
  // History is loaded here rather than by a fetch in the component's mount
  // effect: that waterfall (html -> hydrate -> fetch -> render) meant the
  // morning brief appeared a round trip late on every visit.
  const session = await requireSession();
  const initialTurns = await loadThread(session.orgId, session.userId);

  // Chat reads the ?q= handed over by ⌘K, so it needs a Suspense boundary —
  // useSearchParams cannot be prerendered without one.
  return (
    <Suspense fallback={<div className="px-6 py-10 text-[13px] text-faint">Loading…</div>}>
      <Chat initialTurns={initialTurns} />
    </Suspense>
  );
}
