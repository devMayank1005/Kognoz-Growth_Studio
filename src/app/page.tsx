import { StatusLine, StudioShell, TopBar } from "@/components/studio/shell";
import { PRACTICES, TOWERS, TOWER_KEYS } from "@/domain/practices";
import { curveTarget } from "@/domain/revenue";
import { SIGNALS } from "@/domain/signals";

/**
 * Foundation preview. This is scaffolding for the vertical slice, not the
 * finished Chat workspace — it renders the shell and proves the design tokens,
 * fonts, and domain layer are wired together.
 */
export default function Home() {
  const tier1 = SIGNALS.filter((s) => s.tier === 1).length;

  return (
    <StudioShell
      topBar={<TopBar month={1} open={0} closed={0} pace={curveTarget(1)} dueToday={0} />}
      statusLine={<StatusLine triggersToday={0} />}
    >
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="font-display text-xl tracking-tight text-body">Growth Studio</h1>
        <p className="prose-chat mt-2 text-muted">
          Foundation is in place. The engine, pipeline, and Zoho sync come next — this page exists
          to prove the design system and the domain layer are wired together.
        </p>

        {/* §9.5 — the cyan hairline is how the operator tells engine output
            from their own judgement. Shown here as a live example. */}
        <div className="engine-mark mt-8">
          <p className="prose-chat text-body">
            <span className="font-display">{SIGNALS.length} signals ratified</span> ·{" "}
            <span className="num">{tier1}</span> are tier one ·{" "}
            <span className="num">{PRACTICES.length}</span> practices across{" "}
            <span className="num">{TOWER_KEYS.length}</span> towers.
          </p>
        </div>

        <table className="mt-8 w-full border-collapse text-left">
          <caption className="sr-only">Tower revenue targets</caption>
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-faint">
              <th scope="col" className="h-row px-2 font-medium">Tower</th>
              <th scope="col" className="h-row px-2 font-medium">Practices</th>
              <th scope="col" className="h-row px-2 text-right font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {TOWER_KEYS.map((key) => (
              <tr key={key} className="border-b border-line last:border-0">
                <td className="h-row px-2 font-medium text-body">
                  {key} <span className="text-muted">{TOWERS[key].short}</span>
                </td>
                <td className="h-row px-2 text-muted">{TOWERS[key].practices.length}</td>
                <td className="num h-row px-2 text-right text-body">
                  ${(TOWERS[key].target / 1_000_000).toFixed(0)}M
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 text-[11px] text-faint">
          Targets from PRD §7. Tabular numerals on every money column, per §9.3.
        </p>
      </div>
    </StudioShell>
  );
}
