import Link from "next/link";

import { CurveChart, PanelChart } from "@/components/studio/dashboard-charts";
import { db } from "@/db/client";
import { loadPipeline } from "@/db/queries";
import { settings } from "@/db/schema";
import { byGeography, bySolution, byStage, byTower, curveSeries, openTotal, type PanelRow } from "@/domain/dashboard";
import { requireSession } from "@/lib/session";
import { eq } from "drizzle-orm";

/**
 * Dashboard (PRD §7, §9.9, acceptance #7).
 *
 * Four panels, each a single-hue chart plus a table, and the $20M curve. Every
 * panel partitions the same open pipeline, so the four totals agree with the
 * header — that reconciliation is asserted in domain/dashboard.test.ts.
 */
export default async function DashboardPage() {
  const session = await requireSession();
  const [pipeline, cfg] = await Promise.all([
    loadPipeline(session.orgId),
    db.select({ programStart: settings.programStart }).from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
  ]);

  const total = openTotal(pipeline);
  const closedByMonth = pipeline
    .filter((c) => c.stage === "Won")
    .map((c) => ({ month: 1, value: c.value }));
  const curve = curveSeries(cfg[0]?.programStart ?? new Date().toISOString().slice(0, 10), closedByMonth);

  return (
    <div className="px-6 py-8">
      <div className="mb-6 flex items-baseline gap-3">
        <h1 className="font-display text-xl tracking-tight text-body">Dashboard</h1>
        <span className="num text-[13px] text-muted">{fmt(total)} open</span>
      </div>

      <section className="mb-8">
        <h2 className="mb-2 text-[11px] uppercase tracking-wide text-faint">$20M in 18 months</h2>
        <CurveChart points={curve} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="By tower" rows={byTower(pipeline)} total={total} showTarget />
        <Panel title="By geography" rows={byGeography(pipeline)} total={total} />
        <Panel title="By solution" rows={bySolution(pipeline)} total={total} />
        <Panel title="By stage" rows={byStage(pipeline)} total={total} />
      </div>

      <p className="mt-8 text-[11px] text-faint">
        Every panel totals {fmt(total)} — the same open pipeline, partitioned four ways.
      </p>
    </div>
  );
}

function Panel({ title, rows, total, showTarget }: { title: string; rows: PanelRow[]; total: number; showTarget?: boolean }) {
  const sum = rows.reduce((n, r) => n + r.value, 0);
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 text-[11px] uppercase tracking-wide text-faint">
        {title}
        <span className="num normal-case tracking-normal">{fmt(sum)}</span>
      </h2>
      <PanelChart rows={rows.filter((r) => r.value > 0).map((r) => ({ name: r.label, value: Math.round(r.value / 1000) }))} />
      <table className="mt-2 w-full border-collapse text-left">
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              <td className="h-row px-1">
                {/* Acceptance #7: clicking a row filters the pipeline. */}
                <Link href={`/pipeline?${r.filter.dim}=${encodeURIComponent(r.filter.value)}`} className="text-body hover:text-accent">
                  {r.label}
                </Link>
              </td>
              <td className="num h-row px-1 text-right text-body">{fmt(r.value)}</td>
              {showTarget && (
                <td className="num h-row px-1 text-right text-faint">
                  {r.target ? `of ${fmt(r.target)}` : ""}
                </td>
              )}
              <td className="h-row w-24 px-1">
                {total > 0 && (
                  <span className="block h-1 rounded-full bg-cyan" style={{ width: `${Math.round((r.value / total) * 100)}%` }} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${n}`;
}
