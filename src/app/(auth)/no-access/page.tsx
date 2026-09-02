import { Wordmark } from "@/components/studio/shell";

export default function NoAccessPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="w-full max-w-xs">
        <Wordmark />
        <h1 className="mt-8 font-display text-lg tracking-tight text-body">No access yet</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Your Microsoft account signed in, but it is not a member of a Growth Studio workspace yet.
          Ask an admin to add you.
        </p>
      </div>
    </main>
  );
}
