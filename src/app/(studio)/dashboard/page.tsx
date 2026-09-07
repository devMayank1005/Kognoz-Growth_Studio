import Link from "next/link";

import { CurveChart, PanelChart } from "@/components/studio/dashboard-charts";
import { db } from "@/db/client";
import { loadPipeline } from "@/db/queries";
import { settings } from "@/db/schema";
import { byGeography, bySolution, byStage, byTower, curveSeries, openTotal, type PanelRow } from "@/domain/dashboard";
import { requireSession } from "@/lib/session";
import { loadMoneyView } from "@/lib/money-view";
import { formatCompact, viewMoney, type MoneyView } from "@/domain/money";
import { PROGRAM_TARGET, PROGRAM_TARGET_USD, REDENOMINATION } from "@/domain/revenue";
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
  const money = await loadMoneyView(session.orgId);
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
        <span className="num text-[13px] text-muted">{viewMoney(total, money)} open</span>
      </div>

      <section className="mb-8">
        {/* The target is a rupee figure now, but the commitment it encodes is
            still the PRD's "$20M USD" (§0). Both are stated: the dollar half is
            a frozen constant, never a live conversion, so the headline cannot
            drift to $21.2M one week and $19.4M the next. */}
        <h2 className="mb-2 text-[11px] uppercase tracking-wide text-faint">
          {viewMoney(PROGRAM_TARGET, money)} in 18 months
          <span className="ml-1.5 normal-case tracking-normal text-faint/70">
            · the {formatCompact(PROGRAM_TARGET_USD, "USD")} commitment at ₹{REDENOMINATION.rate}
          </span>
        </h2>
        <CurveChart points={curve} money={money} />
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <Panel title="By tower" rows={byTower(pipeline)} total={total} showTarget money={money} />
        <Panel title="By geography" rows={byGeography(pipeline)} total={total} money={money} />
        <Panel title="By solution" rows={bySolution(pipeline)} total={total} money={money} />
        <Panel title="By stage" rows={byStage(pipeline)} total={total} money={money} />
      </div>

      <p className="mt-8 text-[11px] text-faint">
        Every panel totals {viewMoney(total, money)} — the same open pipeline, partitioned four ways.
      </p>
    </div>
  );
}

function Panel({
  title, rows, total, showTarget, money,
}: {
  title: string; rows: PanelRow[]; total: number; showTarget?: boolean; money: MoneyView;
}) {
  const sum = rows.reduce((n, r) => n + r.value, 0);
  return (
    <section>
      <h2 className="mb-2 flex items-baseline gap-2 text-[11px] uppercase tracking-wide text-faint">
        {title}
        <span className="num normal-case tracking-normal">{viewMoney(sum, money)}</span>
      </h2>
      <PanelChart rows={rows.filter((r) => r.value > 0).map((r) => ({ name: r.label, value: r.value }))}
        money={money} />
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
              <td className="num h-row px-1 text-right text-body">{viewMoney(r.value, money)}</td>
              {showTarget && (
                <td className="num h-row px-1 text-right text-faint">
                  {r.target ? `of ${viewMoney(r.target, money)}` : ""}
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

