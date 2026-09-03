"use client";

import { MotionConfig } from "motion/react";
import { useEffect } from "react";
import { Toaster } from "sonner";

import { useWorkspace } from "@/store/selection";

/**
 * Client-side providers for the whole app.
 *
 * MotionConfig lives here rather than in the root layout because it needs a
 * client boundary. `reducedMotion="user"` is the single switch that satisfies
 * PRD §9.8 for every Motion-driven animation; the CSS media query in
 * globals.css covers the rest.
 *
 * The default transition is the §9.6 house style: 180ms, ease-out, nothing
 * showier.
 *
 * There is no QueryClientProvider: nothing in the app calls useQuery or
 * useMutation — every page loads its data in a server component — so mounting
 * TanStack Query shipped a library on every route that did nothing. It can come
 * back in one line the day something actually needs client-side caching.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
      <WorkspaceHydration />
      {children}
      {/* §9.6 — toasts are confirmations, never questions. */}
      <Toaster position="bottom-right" toastOptions={{ duration: 6000 }} />
    </MotionConfig>
  );
}

/**
 * Restores the persisted workspace state one tick after mount.
 *
 * The store sets `skipHydration` so the first client render matches the
 * server's HTML; reading localStorage any earlier would be a hydration
 * mismatch. Renders nothing.
 */
function WorkspaceHydration() {
  useEffect(() => {
    // Optional-chained deliberately: when the browser gives zustand no storage
    // — private windows, blocked site data — the persist middleware attaches no
    // API at all, and assuming it would throw during mount and take the whole
    // app down. Losing the draft is acceptable; losing the app is not.
    void useWorkspace.persist?.rehydrate();
  }, []);
  return null;
}
