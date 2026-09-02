"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState } from "react";

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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Pipeline and target data is refreshed by sweeps and mutations,
            // not by polling — refetching on every focus would churn the table
            // under the operator while they are reading it.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}>
        {children}
      </MotionConfig>
    </QueryClientProvider>
  );
}
