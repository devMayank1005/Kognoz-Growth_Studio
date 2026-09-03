"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { CurvePoint } from "@/domain/dashboard";

const axis = { fontSize: 11, fill: "var(--gs-text-faint)" };
const tooltip = {
  fontSize: 12, borderRadius: 4,
  border: "1px solid var(--gs-border)", background: "var(--gs-surface)",
};

/** §9.2 — panels are cyan: this is machine-aggregated signal. */
export function PanelChart({ rows }: { rows: Array<{ name: string; value: number }> }) {
  if (rows.length === 0) return <div className="h-32" />;
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="var(--gs-border)" vertical={false} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={axis} tickLine={false} axisLine={false} />
          <Tooltip cursor={{ fill: "var(--gs-panel)" }} contentStyle={tooltip} formatter={(v) => [`$${Number(v ?? 0)}K`, "value"]} />
          <Bar dataKey="value" fill="var(--gs-signal)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * §9.2 — the curve is Kognoz BLUE, not cyan. It is the firm's own commitment,
 * which is human judgement, not machine output.
 */
export function CurveChart({ points }: { points: CurvePoint[] }) {
  const data = points.map((p) => ({
    month: `M${p.month}`,
    target: Math.round(p.target / 1000),
    // Truncated here, not in the data: a flat line running to month 18 would
    // read as a forecast.
    closed: p.isFuture ? null : Math.round(p.closed / 1000),
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="var(--gs-border)" vertical={false} />
          <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${Math.round(v / 1000)}M`} />
          <Tooltip contentStyle={tooltip} formatter={(v) => [`$${Number(v ?? 0)}K`, ""]} />
          <Line type="monotone" dataKey="target" stroke="var(--gs-accent)" strokeWidth={2} dot={false} name="Target" isAnimationActive={false} />
          <Line type="monotone" dataKey="closed" stroke="var(--gs-green)" strokeWidth={2} dot={false} connectNulls={false} name="Closed" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
