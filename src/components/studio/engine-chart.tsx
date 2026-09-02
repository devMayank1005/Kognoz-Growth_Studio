"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { EngineChart } from "@/engine/schemas";

/**
 * §9.2 — a single hue per chart. Konverz cyan, because a chart in a chat reply
 * is engine-generated: machine intelligence, not human judgement.
 */
export function EngineChartBlock({ chart }: { chart: EngineChart }) {
  const cyan = "var(--gs-signal)";

  return (
    <figure className="mt-4">
      <figcaption className="mb-2 text-[11px] uppercase tracking-wide text-faint">{chart.title}</figcaption>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "line" ? (
            <LineChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="var(--gs-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid var(--gs-border)", background: "var(--gs-surface)" }} />
              <Line type="monotone" dataKey="value" stroke={cyan} strokeWidth={2} dot={false} />
            </LineChart>
          ) : (
            <BarChart data={chart.data} margin={{ top: 4, right: 8, bottom: 4, left: -16 }}>
              <CartesianGrid stroke="var(--gs-border)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--gs-text-faint)" }} tickLine={false} axisLine={false} />
              <Tooltip cursor={{ fill: "var(--gs-panel)" }} contentStyle={{ fontSize: 12, borderRadius: 4, border: "1px solid var(--gs-border)", background: "var(--gs-surface)" }} />
              <Bar dataKey="value" fill={cyan} radius={[2, 2, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
