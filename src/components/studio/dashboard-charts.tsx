"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { CurvePoint } from "@/domain/dashboard";
import { viewMoney, type MoneyView } from "@/domain/money";

const axis = { fontSize: 11, fill: "var(--gs-text-faint)" };
const tooltip = {
  fontSize: 12, borderRadius: 4,
  border: "1px solid var(--gs-border)", background: "var(--gs-surface)",
};

/** §9.2 — panels are cyan: this is machine-aggregated signal. */
export function PanelChart({
  rows,
  money,
}: {
  /** `value` is the RAW figure in the base currency; the tooltip converts. */
  rows: Array<{ name: string; value: number }>;
  money: MoneyView;
}) {
  if (rows.length === 0) return <div className="h-32" />;
  return (
    <div className="h-32 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 4, left: -20 }}>
          <CartesianGrid stroke="var(--gs-border)" vertical={false} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} />
          {/* The curve chart below has always formatted its axis; this one did
              not, so the ticks were raw integers clipped to "00000" by the
              default axis width. */}
          <YAxis
            tick={axis}
            tickLine={false}
            axisLine={false}
            width={58}
            tickFormatter={(v: number) => viewMoney(v, money)}
          />
          <Tooltip cursor={{ fill: "var(--gs-panel)" }} contentStyle={tooltip} formatter={(v) => [viewMoney(Number(v ?? 0), money), "value"]} />
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
export function CurveChart({ points, money }: { points: CurvePoint[]; money: MoneyView }) {
  const data = points.map((p) => ({
    month: `M${p.month}`,
    target: p.target,
    // Truncated here, not in the data: a flat line running to month 18 would
    // read as a forecast.
    closed: p.isFuture ? null : p.closed,
  }));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: -12 }}>
          <CartesianGrid stroke="var(--gs-border)" vertical={false} />
          <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(v: number) => viewMoney(v, money)} />
          <Tooltip contentStyle={tooltip} formatter={(v) => [viewMoney(Number(v ?? 0), money), ""]} />
          <Line type="monotone" dataKey="target" stroke="var(--gs-accent)" strokeWidth={2} dot={false} name="Target" isAnimationActive={false} />
          <Line type="monotone" dataKey="closed" stroke="var(--gs-green)" strokeWidth={2} dot={false} connectNulls={false} name="Closed" isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
