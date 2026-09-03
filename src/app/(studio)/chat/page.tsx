import { Suspense } from "react";

import { Chat } from "@/components/studio/chat";

export default function ChatPage() {
  // Chat reads the ?q= handed over by ⌘K, so it needs a Suspense boundary —
  // useSearchParams cannot be prerendered without one.
  return (
    <Suspense fallback={<div className="px-6 py-10 text-[13px] text-faint">Loading…</div>}>
      <Chat />
    </Suspense>
  );
}
