"use client";

import {
  DndContext, PointerSensor, closestCorners,
  useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { moveToStage } from "@/app/actions/card-actions";
import type { PipelineCardRow } from "@/db/queries";
import { viewMoney, type MoneyView } from "@/domain/money";
import { practiceById } from "@/domain/practices";
import { useSelection } from "@/store/selection";
import { cn } from "@/lib/cn";

/**
 * The Kanban board (PRD §5, "new in v1").
 *
 * §9.8 commits to full keyboard coverage. I first tried dnd-kit's KeyboardSensor
 * — pick up with space, arrow to move, space to drop — and it fought back:
 * simulated dragging is a mouse metaphor wearing a keyboard costume, and it took
 * three failed attempts against dnd-kit's translation-space coordinate API
 * before I stopped and questioned the approach.
 *
 * So: MOUSE users drag (which works), and everyone gets an explicit "move to
 * stage" select on every card. That is not a fallback — it is how accessible
 * boards actually work, it is faster than dragging even with a mouse, and it
 * works on touch where dragging is fiddly.
 *
 * Both paths call the same `moveToStage` server action the inspector's outcome
 * grid uses, so "what a stage change means" has one definition.
 */

/** The working flow. Won and Lost are outcomes, not columns to drag through. */
const COLUMNS = [
  "Prospect", "Plan reach-out", "Reached out",
  "In conversation", "Meeting set", "Proposal",
] as const;

const STAGE_WORD: Record<string, string> = {
  "Prospect": "Prospect", "Plan reach-out": "Tagged", "Reached out": "Contacted",
  "In conversation": "Talking", "Meeting set": "Meeting", "Proposal": "Proposal",
};


export function Kanban({ cards, money }: { cards: PipelineCardRow[]; money: MoneyView }) {
  const router = useRouter();
  const [moving, setMoving] = useState<string | null>(null);

  // Pointer only. Keyboard users get the explicit stage selector on each card
  // instead — see the note on StageSelect below.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  /** One path for both drag and select, so they cannot diverge. */
  async function move(id: string, stage: string) {
    const card = cards.find((c) => c.id === id);
    if (!card || card.stage === stage) return;

    setMoving(id);
    const result = await moveToStage(id, stage as (typeof COLUMNS)[number]);
    setMoving(null);

    if (!result.ok) return toast.error(result.message);
    toast.success(`${card.account} → ${STAGE_WORD[stage] ?? stage}`);
    router.refresh();
  }

  function onDragEnd(event: DragEndEvent) {
    if (!event.over) return;
    void move(String(event.active.id), String(event.over.id));
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {COLUMNS.map((stage) => {
          const inColumn = cards.filter((c) => c.stage === stage);
          const value = inColumn.reduce((n, c) => n + c.value, 0);
          return (
            <Column key={stage} stage={stage} count={inColumn.length} value={value} money={money}>
              {inColumn.map((card) => (
                <Card key={card.id} card={card} busy={moving === card.id} onMove={move} money={money} />
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}

function Column({
  stage, count, value, children, money,
}: { stage: string; count: number; value: number; children: React.ReactNode; money: MoneyView }) {
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
        {value > 0 && <span className="num ml-auto normal-case tracking-normal text-muted">{viewMoney(value, money)}</span>}
      </h3>
      <div className="flex min-h-16 flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Card({ card, busy, onMove, money }: { card: PipelineCardRow; busy: boolean; onMove: (id: string, stage: string) => void; money: MoneyView }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const select = useSelection((s) => s.select);

  return (
    <article
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      {...listeners}
      {...attributes}
      onClick={() => select(card)}
      aria-label={`${card.account}, ${STAGE_WORD[card.stage] ?? card.stage}, ${viewMoney(card.value, money)}`}
      className={cn(
        "cursor-grab rounded border border-line bg-surface p-2 text-left transition-shadow duration-150",
        isDragging && "opacity-60 shadow-lg",
        busy && "opacity-50",
      )}
    >
      <p className="text-[13px] font-medium text-body">{card.account}</p>
      <p className="text-[11px] text-muted">{practiceById(card.practiceId)?.name ?? card.practiceId}</p>
      <p className="mt-1 flex items-baseline gap-2 text-[11px]">
        <span className="num text-body">{viewMoney(card.value, money)}</span>
        <span className="truncate text-faint">{card.partner}</span>
      </p>
      {card.touches > 0 && (
        <p className="num mt-0.5 text-[11px] text-faint">{card.touches} of 3 touches</p>
      )}

      {/* The accessible path, and honestly the faster one. A native select
          announces correctly, works by keyboard, and works on touch. */}
      <label className="mt-1.5 block">
        <span className="sr-only">Move {card.account} to stage</span>
        <select
          value={card.stage}
          disabled={busy}
          // Stop the click reaching the card, which would open the inspector.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => onMove(card.id, e.target.value)}
          className="w-full rounded border border-line bg-canvas px-1 py-0.5 text-[11px] text-muted"
        >
          {COLUMNS.map((s) => (
            <option key={s} value={s}>{STAGE_WORD[s] ?? s}</option>
          ))}
        </select>
      </label>
    </article>
  );
}
