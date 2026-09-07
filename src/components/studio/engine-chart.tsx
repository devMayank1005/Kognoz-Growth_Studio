"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { viewMoney, type MoneyView } from "@/domain/money";
import type { EngineChart } from "@/engine/schemas";

/**
 * §9.2 — a single hue per chart. Konverz cyan, because a chart in a chat reply
 * is engine-generated: machine intelligence, not human judgement.
 */
export function EngineChartBlock({ chart, money }: { chart: EngineChart; money?: MoneyView }) {
  const cyan = "var(--gs-signal)";

  // Only when the chart says it is money. A count of triggers formatted as
  // currency would be worse than an unformatted amount.
  const fmt =
    chart.unit === "money" && money
      ? (v: number) => viewMoney(v, money)
      : undefined;

  return (
    <figure className="mt-4">
      <figcaption className="mb-2 text-[11px] uppercase tracking-wide text-faint">{chart.title}</figcaption>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="var(--gs-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} tickFormatter={fmt} width={fmt ? 64 : undefined} />
              <Tooltip formatter={fmt ? (v: unknown) => (typeof v === "number" ? fmt(v) : String(v ?? "")) : undefined} contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid var(--gs-border)", background: "var(--gs-surface)" }} />
              <Line type="monotone" dataKey="value" stroke={cyan} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="var(--gs-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} tickFormatter={fmt} width={fmt ? 64 : undefined} />
              <Tooltip formatter={fmt ? (v: unknown) => (typeof v === "number" ? fmt(v) : String(v ?? "")) : undefined} cursor={{ fill: "var(--gs-panel)" }} contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid var(--gs-border)", background: "var(--gs-surface)" }} />
              <Bar dataKey="value" fill={cyan} radius={[2, 2, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
