import { Suspense } from "react";

import { SignInButton } from "@/components/auth/sign-in-button";
import { Wordmark } from "@/components/studio/shell";

/**
 * §9.7 — empty states teach exactly one action. There is one way in, so the
 * page shows one button and nothing else.
 */
export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-xs">
        <Wordmark />

        <h1 className="mt-8 font-display text-lg tracking-tight text-body">Sign in</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Growth Studio uses your Kognoz Microsoft account.
        </p>

        {/* SignInButton reads the `next` search param, so it must sit behind a
            Suspense boundary or the page cannot be prerendered. */}
        <div className="mt-6">
          <Suspense fallback={<div className="h-9 rounded border border-line bg-panel" />}>
            <SignInButton />
          </Suspense>
        </div>

        <p className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-faint">
          Prospect records hold name, title, company and public source only. No personal contact
          details are collected or stored.
        </p>
      </div>
    </main>
  );
}
