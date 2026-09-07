import { Suspense } from "react";

import { Chat } from "@/components/studio/chat";
import { listConversations, loadConversation } from "@/db/conversations";
import { requireSession } from "@/lib/session";
import { loadMoneyView } from "@/lib/money-view";

export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  // History is loaded here rather than by a fetch in the component's mount
  // effect: that waterfall (html -> hydrate -> fetch -> render) meant the
  // morning brief appeared a round trip late on every visit.
  const session = await requireSession();
  const { c } = await searchParams;

  const conversations = await listConversations(session.orgId, session.userId);
  const money = await loadMoneyView(session.orgId);

  // `?c=` names the conversation; anything unknown falls back to the first,
  // which is the pinned brief when there is one. A brand-new operator has no
  // conversations at all and gets one created on their first question.
  const wanted = typeof c === "string" ? c : null;
  const selectedId = conversations.some((x) => x.id === wanted) ? wanted : (conversations[0]?.id ?? null);
  const selected = selectedId ? await loadConversation(session.orgId, session.userId, selectedId) : null;

  return (
    // Chat reads the ?q= handed over by ⌘K, so it needs a Suspense boundary —
    // useSearchParams cannot be prerendered without one.
    <Suspense fallback={<div className="px-6 py-10 text-[13px] text-faint">Loading…</div>}>
      <Chat
        key={selectedId ?? "new"}
        conversations={conversations}
        conversationId={selectedId}
        initialTurns={selected?.turns ?? []}
        money={money}
      />
    </Suspense>
  );
}
