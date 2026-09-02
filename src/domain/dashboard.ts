/**
 * Dashboard aggregation (PRD §7, acceptance #7).
 *
 * The criterion is "dashboard panels reconcile to the pipeline totals", which
 * is an invariant, not a hope. Every breakdown here therefore partitions the
 * SAME set of open cards — a card with a missing country or practice lands in
 * an explicit bucket rather than being dropped, because a panel that quietly
 * loses rows is how a dashboard starts lying to the person relying on it.
 */

import { practiceById, TOWERS, TOWER_KEYS } from "./practices";
import { curveTarget, monthOf, TOWER_TARGETS, type TowerKey } from "./revenue";

/** Shown when a card has no value for the dimension being grouped by. */
export const UNASSIGNED = "Unassigned";

const CLOSED = new Set(["Won", "Lost"]);

export interface DashboardCard {
  tower: string;
  practiceId: string;
  stage: string;
  value: number;
  country: string;
}

export interface PanelRow {
  key: string;
  label: string;
  value: number;
  /** Only the tower panel has a target to measure against. */
  target?: number;
  /** The query param that filters Pipeline to this row. */
  filter: { dim: string; value: string };
}

const live = <T extends { stage: string }>(cards: readonly T[]) => cards.filter((c) => !CLOSED.has(c.stage));

export function openTotal(cards: readonly DashboardCard[]): number {
  return live(cards).reduce((n, c) => n + c.value, 0);
}

function group(
  cards: readonly DashboardCard[],
  dim: string,
  keyOf: (c: DashboardCard) => string,
  labelOf: (key: string) => string,
): PanelRow[] {
  const totals = new Map<string, number>();
  for (const c of live(cards)) {
    const key = keyOf(c) || UNASSIGNED;
    totals.set(key, (totals.get(key) ?? 0) + c.value);
  }
  return [...totals.entries()]
    .map(([key, value]) => ({ key, label: labelOf(key), value, filter: { dim, value: key } }))
    .sort((a, b) => b.value - a.value);
}

/** Tower panel, with every tower listed even at zero so targets stay visible. */
export function byTower(cards: readonly DashboardCard[]): PanelRow[] {
  const grouped = new Map(group(cards, "tower", (c) => c.tower, (k) => k).map((r) => [r.key, r.value]));

  const rows: PanelRow[] = TOWER_KEYS.map((t) => ({
    key: t,
    label: `${t} ${TOWERS[t].short}`,
    value: grouped.get(t) ?? 0,
    target: TOWER_TARGETS[t as TowerKey],
    filter: { dim: "tower", value: t },
  }));

  // A card with an unrecognised tower would otherwise vanish and break
  // reconciliation, so it is surfaced rather than swallowed.
  for (const [key, value] of grouped) {
    if (!TOWER_KEYS.includes(key as TowerKey)) {
      rows.push({ key, label: key, value, filter: { dim: "tower", value: key } });
    }
  }

  return rows.sort((a, b) => b.value - a.value);
}

export function byGeography(cards: readonly DashboardCard[]): PanelRow[] {
  return group(cards, "country", (c) => c.country, (k) => k);
}

export function bySolution(cards: readonly DashboardCard[]): PanelRow[] {
  return group(cards, "practice", (c) => c.practiceId, (k) => practiceById(k)?.name ?? k);
}

export function byStage(cards: readonly DashboardCard[]): PanelRow[] {
  return group(cards, "stage", (c) => c.stage, (k) => k);
}

export interface CurvePoint {
  month: number;
  target: number;
  /** Closed revenue accumulated to the end of this month. */
  closed: number;
  /** True for months that have not happened yet. */
  isFuture: boolean;
}

/**
 * The $20M curve (PRD §7): the committed target line against closed-to-date.
 * Closed revenue accumulates — the question is always "how much have we banked
 * by now", not "what did we bank in month nine".
 */
export function curveSeries(
  programStartISO: string,
  closedByMonth: ReadonlyArray<{ month: number; value: number }>,
  now: Date = new Date(),
): CurvePoint[] {
  const current = monthOf(programStartISO, now);
  let running = 0;

  return Array.from({ length: 18 }, (_, i) => {
    const month = i + 1;
    running += closedByMonth.filter((c) => c.month === month).reduce((n, c) => n + c.value, 0);
    return {
      month,
      target: curveTarget(month),
      closed: running,
      // The chart stops the closed line here — drawing it flat into the future
      // would read as a forecast. Kept as a flag rather than zeroing `closed`,
      // so this function reports the data and the chart decides what to show.
      isFuture: month > current,
    };
  });
}
