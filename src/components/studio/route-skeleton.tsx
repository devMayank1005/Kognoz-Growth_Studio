/**
 * What a studio route shows while its data is in flight.
 *
 * There was no loading UI anywhere, so every rail click left the previous page
 * on screen until the database answered — from India that is ~280ms of
 * Washington round trip spent looking at the wrong section. A skeleton makes
 * the navigation feel instant and tells the operator where they landed.
 *
 * Server component: this must never wait on hydration.
 */
export function RouteSkeleton({ title, rows = 6 }: { title: string; rows?: number }) {
  return (
    <div className="px-6 py-8" aria-busy="true" aria-label={`Loading ${title}`}>
      <div className="mx-auto max-w-5xl">
        <h1 className="font-display text-xl tracking-tight text-body">{title}</h1>
        <div className="mt-6 space-y-1.5">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="h-row animate-pulse rounded bg-panel" />
          ))}
        </div>
      </div>
    </div>
  );
}
