"use client";

import {
  DndContext, KeyboardSensor, PointerSensor, closestCorners,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type KeyboardCoordinateGetter,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { moveToStage } from "@/app/actions/card-actions";
import type { PipelineCardRow } from "@/db/queries";
import { practiceById } from "@/domain/practices";
import { useSelection } from "@/store/selection";
import { cn } from "@/lib/cn";

/**
 * The Kanban board (PRD §5, "new in v1").
 *
 * dnd-kit rather than a lighter drag library for one reason: KeyboardSensor.
 * §9.8 commits to full keyboard coverage, and a board you can only operate with
 * a mouse silently excludes anyone who cannot use one. Space picks a card up,
 * arrow keys move between columns, space drops, escape cancels.
 *
 * A drop calls the same `moveToStage` server action the inspector's outcome
 * grid path uses, so "what a stage change means" has one definition.
 */

/**
 * Move one COLUMN per arrow press, not 25 pixels.
 *
 * dnd-kit's default keyboard coordinate getter translates by a fixed small
 * delta, which is right for a sortable list and useless for a board: a column
 * is ~240px wide, so a single arrow press never crosses one and the board is
 * focusable but not actually operable by keyboard. That would make the §9.8
 * keyboard-coverage promise hollow, so this snaps to the adjacent column.
 */
const columnCoordinateGetter: KeyboardCoordinateGetter = (event, { context, currentCoordinates }) => {
  const { droppableContainers, droppableRects, collisionRect } = context;
  if (!collisionRect) return;

  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (direction === 0) return;

  const columns = Array.from(droppableContainers.values())
    .map((c) => ({ id: String(c.id), rect: droppableRects.get(c.id) }))
    .flatMap((c) => (c.rect ? [{ id: c.id, rect: c.rect }] : []))
    .sort((a, b) => a.rect.left - b.rect.left);
  if (columns.length === 0) return;

  const centreOf = (r: { left: number; width: number }) => r.left + r.width / 2;
  const dragCentre = collisionRect.left + collisionRect.width / 2;

  let current = 0;
  let best = Number.POSITIVE_INFINITY;
  columns.forEach((c, i) => {
    const d = Math.abs(centreOf(c.rect) - dragCentre);
    if (d < best) { best = d; current = i; }
  });

  const target = columns[current + direction];
  if (!target) return;

  // Return a DELTA applied to the current coordinates, not an absolute
  // position. dnd-kit works in translation space; returning absolute page
  // coordinates leaves the card over its original column, which is exactly
  // what the live region reported while debugging this.
  return {
    x: currentCoordinates.x + (centreOf(target.rect) - centreOf(columns[current].rect)),
    y: currentCoordinates.y,
  };
};

/** The working flow. Won and Lost are outcomes, not columns to drag through. */
const COLUMNS = [
  "Prospect", "Plan reach-out", "Reached out",
  "In conversation", "Meeting set", "Proposal",
] as const;

const STAGE_WORD: Record<string, string> = {
  "Prospect": "Prospect", "Plan reach-out": "Tagged", "Reached out": "Contacted",
  "In conversation": "Talking", "Meeting set": "Meeting", "Proposal": "Proposal",
};

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

export function Kanban({ cards }: { cards: PipelineCardRow[] }) {
  const router = useRouter();
  const [moving, setMoving] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // The reason for this library. Without it the board is mouse-only — and
    // without the coordinate getter above, keyboard "support" would move a card
    // 25px and never reach the next column.
    useSensor(KeyboardSensor, { coordinateGetter: columnCoordinateGetter }),
  );

  async function onDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const stage = event.over?.id ? String(event.over.id) : null;
    if (!stage) return;

    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;

    setMoving(id);
    const result = await moveToStage(id, stage as (typeof COLUMNS)[number]);
    setMoving(null);

    if (!result.ok) return toast.error(result.message);
    toast.success(`${card.account} → ${STAGE_WORD[stage] ?? stage}`);
    router.refresh();
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((stage) => {
          const inColumn = cards.filter((c) => c.stage === stage);
          const value = inColumn.reduce((n, c) => n + c.value, 0);
          return (
            <Column key={stage} stage={stage} count={inColumn.length} value={value}>
              {inColumn.map((card) => (
                <Card key={card.id} card={card} busy={moving === card.id} />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({
  stage, count, value, children,
}: { stage: string; count: number; value: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <section
      ref={setNodeRef}
      aria-label={STAGE_WORD[stage] ?? stage}
      className={cn(
        "flex w-60 shrink-0 flex-col rounded border border-line bg-panel p-2 transition-colors duration-150",
        isOver && "border-cyan",
      )}
    >
      <h3 className="mb-2 flex items-baseline gap-2 px-1 text-[11px] uppercase tracking-wide text-faint">
        {STAGE_WORD[stage] ?? stage}
        <span className="num">{count}</span>
        {value > 0 && <span className="num ml-auto normal-case tracking-normal text-muted">{fmt(value)}</span>}
      </h3>
      <div className="flex min-h-16 flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Card({ card, busy }: { card: PipelineCardRow; busy: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const select = useSelection((s) => s.select);

  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
      {...attributes}
      onClick={() => select(card)}
      aria-label={`${card.account}, ${STAGE_WORD[card.stage] ?? card.stage}, ${fmt(card.value)}`}
      className={cn(
        "cursor-grab rounded border border-line bg-surface p-2 text-left transition-shadow duration-150",
        isDragging && "opacity-60 shadow-lg",
        busy && "opacity-50",
      )}
    >
      <p className="text-[13px] font-medium text-body">{card.account}</p>
      <p className="text-[11px] text-muted">{practiceById(card.practiceId)?.name ?? card.practiceId}</p>
      <p className="mt-1 flex items-baseline gap-2 text-[11px]">
        <span className="num text-body">{fmt(card.value)}</span>
        <span className="truncate text-faint">{card.partner}</span>
      </p>
      {card.touches > 0 && (
        <p className="num mt-0.5 text-[11px] text-faint">{card.touches} of 3 touches</p>
      )}
    </article>
  );
}
