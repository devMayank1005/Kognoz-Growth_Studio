"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  dispatchPacket,
  generateDraft,
  loadTimeline,
  markDraftSent,
  moveToStage,
  recordOutcome,
  setCardValue,
  type CardPatch,
} from "@/app/actions/card-actions";
import { OUTCOMES, OUTCOME_LABELS, type Outcome } from "@/domain/outcomes";
import { practiceById } from "@/domain/practices";
import { TOUCH_CAP, defaultDraftKind } from "@/domain/touches";
import { useSelection } from "@/store/selection";
import { cn } from "@/lib/cn";
import type { PipelineCardRow } from "@/db/queries";

/**
 * The inspector (PRD §9.9): the selected card as an aligned key-value block,
 * actions in priority order, the outcome grid, and a timeline excerpt.
 *
 * Nothing selected keeps the snapshot — an empty panel teaches nothing (§9.7).
 */

const fmtValue = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

type Timeline = Awaited<ReturnType<typeof loadTimeline>>;

export function InspectorPanel({
  dueToday = [],
  recent = [],
  openValue = 0,
  pendingZoho = 0,
}: {
  dueToday?: PipelineCardRow[];
  recent?: PipelineCardRow[];
  openValue?: number;
  pendingZoho?: number;
}) {
  const card = useSelection((s) => s.card);

  if (!card) {
    return (
      <Snapshot
        dueToday={dueToday}
        recent={recent}
        openValue={openValue}
        pendingZoho={pendingZoho}
      />
    );
  }

  /**
 * §9.9 — "Nothing selected: snapshot, due today, recently added, push button."
 *
 * All of this was already loaded by the studio layout and thrown away: the panel
 * received zero props and rendered one sentence of prose. Every row here is
 * clickable, so the inspector is a way into the pipeline rather than a dead end.
 */
function Snapshot({
  dueToday,
  recent,
  openValue,
  pendingZoho,
}: {
  dueToday: PipelineCardRow[];
  recent: PipelineCardRow[];
  openValue: number;
  pendingZoho: number;
}) {
  const select = useSelection((s) => s.select);

  const List = ({ title, cards, empty }: { title: string; cards: PipelineCardRow[]; empty: string }) => (
    <section>
      <h3 className="flex items-baseline gap-2 border-b border-line pb-1">
        <span className="text-[11px] uppercase tracking-wide text-faint">{title}</span>
        <span className="num text-[11px] text-faint">{cards.length}</span>
      </h3>
      {cards.length === 0 ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-faint">{empty}</p>
      ) : (
        <ul className="mt-1">
          {cards.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => select(c)}
                className="flex w-full items-baseline gap-2 rounded px-1 py-1 text-left transition-colors duration-150 hover:bg-panel"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-body">{c.account}</span>
                <span className="num shrink-0 text-[11px] text-faint">
                  ${Math.round(c.value / 1000)}K
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-[13px] text-body">Snapshot</h2>
        <p className="num mt-0.5 text-[13px] text-muted">
          ${(openValue / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M open
        </p>
      </div>

      <List title="Due today" cards={dueToday} empty="Nothing due. Go hunting." />
      <List title="Recently added" cards={recent} empty="Nothing added yet." />

      <div className="border-t border-line pt-3">
        <button
          type="button"
          disabled
          title="Zoho is not connected yet"
          className="w-full cursor-not-allowed rounded border border-line px-2.5 py-1.5 text-[13px] text-faint"
        >
          Push {pendingZoho} to Zoho
        </button>
        <p className="mt-1 text-[11px] text-faint">Zoho is not connected yet.</p>
      </div>
    </div>
  );
}

// Keyed by card id so selecting a different card remounts this and clears the
  // in-progress draft and timeline. Resetting that state inside an effect would
  // cascade an extra render for no benefit.
  return <CardInspector key={card.id} card={card} />;
}

function CardInspector({ card }: { card: NonNullable<ReturnType<typeof useSelection.getState>["card"]> }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ id: string; subject: string; body: string; mailto: string } | null>(null);
  const [timeline, setTimeline] = useState<Timeline>([]);
  const select = useSelection((s) => s.select);
  const router = useRouter();

  /**
   * A mutation changes the card in two places the UI has to catch up with: the
   * snapshot this panel is showing, and the server-rendered Pipeline table.
   * Merge the returned patch for the former, refresh for the latter. Without
   * this the write lands but the operator sees stale values and assumes it
   * failed.
   */
  const applyPatch = (patch: Partial<{ stage: string; touches: number; next: string; due: string }>) => {
    select({ ...card, ...patch });
    router.refresh();
  };

  useEffect(() => {
    let cancelled = false;
    loadTimeline(card.id)
      .then((t) => !cancelled && setTimeline(t))
      .catch(() => !cancelled && setTimeline([]));
    return () => {
      cancelled = true;
    };
  }, [card.id]);

  // defaultDraftKind, not stageKind: stageKind can never return "congrats", so
  // the two-beat play (§4.6) was unreachable and every fresh appointment spent
  // a touch on a pitch it should not have sent.
  const kind = defaultDraftKind(card);

  /**
   * Every handler below is wrapped.
   *
   * These server actions return `{ok:false}` for EXPECTED refusals (DNC, budget,
   * card not found) but they THROW on infrastructure failure — `requireSession`
   * and every query throw when the database is unreachable, which from India
   * happens. Without a `finally`, `setBusy(null)` never ran on a rejection and
   * the button stayed disabled showing "…" forever, with no toast and no way
   * back but a reload. That is what "the buttons do nothing" actually was.
   */
  function failed(err: unknown) {
    console.error("[inspector] action failed", err);
    toast.error("That did not go through", {
      description: "The server did not answer. Nothing was changed — try again.",
    });
  }

  /** Timeline is a nice-to-have; never let its failure surface as an error. */
  function refreshTimeline() {
    loadTimeline(card.id)
      .then(setTimeline)
      .catch(() => {});
  }

  async function onDraft() {
    setBusy("draft");
    try {
      const r = await generateDraft(card.id, kind);
      if (r.ok) setDraft({ id: r.draftId, subject: r.subject, body: r.body, mailto: r.mailto });
      else toast.error(r.message);
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  }

  async function onSent() {
    if (!draft) return;
    setBusy("sent");
    try {
      const r = await markDraftSent(card.id, draft.id, kind);
      if (!r.ok) return toast.error(r.message);
      applyPatch(r.patch);
      toast.success(`${card.account} → ${r.patch.stage}`, {
        description: r.rotateOrPark
          ? `Touch ${r.patch.touches} of ${TOUCH_CAP} — rotate the door or park it.`
          : `Touch ${r.patch.touches} of ${TOUCH_CAP}.`,
      });
      setDraft(null);
      refreshTimeline();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  }

  async function onPacket() {
    setBusy("packet");
    try {
      const r = await dispatchPacket(card.id);
      if (!r.ok) return toast.error(r.message);
      applyPatch(r.patch);
      try {
        await navigator.clipboard.writeText(r.text);
        toast.success(`Packet copied — paste to ${card.partner}.`);
      } catch {
        toast.success("Packet ready", { description: "Clipboard blocked; open the card to copy." });
      }
      refreshTimeline();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  }

  async function onOutcome(o: Outcome) {
    const previousStage = card.stage;
    setBusy(o);
    try {
      const r = await recordOutcome(card.id, o);
      if (!r.ok) return toast.error(r.message);
      applyPatch(r.patch);

      // §9.6 — destructive outcomes get an Undo, not a confirm dialog. Won, Dead
      // and Park all drop the card out of every live count, and a mis-click had
      // no way back.
      const reversible = o === "won" || o === "dead" || o === "park";
      toast.success(`${card.account} — ${OUTCOME_LABELS[o]}`, {
        action: reversible
          ? {
              label: "Undo",
              onClick: () => {
                // The cast is safe: moveToStage validates the stage against its own
                // list and returns {ok:false} for anything unknown, and this value
                // came from a card the server itself wrote.
                const back = previousStage as Parameters<typeof moveToStage>[1];
                void moveToStage(card.id, back)
                  .then((undone) => {
                    if (!undone.ok) return toast.error(undone.message);
                    applyPatch({ ...r.patch, stage: previousStage });
                    toast.success(`${card.account} back to ${previousStage}`);
                    refreshTimeline();
                  })
                  .catch(failed);
              },
            }
          : undefined,
      });
      refreshTimeline();
    } catch (err) {
      failed(err);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-[13px] tracking-tight text-body">{card.account}</h2>
        <p className="text-[11px] text-faint">{card.country || "—"} · {card.industry || "—"}</p>
      </div>

      <dl className="space-y-1">
        <ValueField card={card} onSaved={applyPatch} />
        <Field label="Solution" value={practiceById(card.practiceId)?.name ?? card.practiceId} />
        <Field label="Stage" value={card.stage} />
        <Field label="Partner" value={card.partner} />
        <Field label="Contact" value={card.contact || "to identify"} faint={!card.contact} />
        <Field label="Next" value={card.next || "—"} />
        <Field label="Touches" value={`${card.touches} of ${TOUCH_CAP}`} num tone={card.touches >= TOUCH_CAP ? "amber" : undefined} />
      </dl>

      {card.evidence && (
        <div className="engine-mark">
          <p className="text-[13px] leading-relaxed text-muted">{card.evidence}</p>
          {card.url && (
            <a href={card.url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent underline underline-offset-2">
              source
            </a>
          )}
        </div>
      )}

      {/* Actions in priority order (§9.9). */}
      <div className="flex flex-wrap gap-1.5">
        <Action onClick={onDraft} busy={busy === "draft"} primary>
          {kind === "congrats"
            ? "Congratulate"
            : card.touches === 0
              ? "Draft first note"
              : "Draft next note"}
        </Action>
        <Action onClick={onPacket} busy={busy === "packet"}>
          Packet → {card.partner?.split("—").pop()?.trim() ?? "partner"}
        </Action>
      </div>

      {draft && (
        <div className="rounded border border-line bg-surface p-3">
          <p className="text-[11px] uppercase tracking-wide text-faint">Draft — edit before sending</p>
          <p className="mt-1.5 text-[13px] font-medium text-body">{draft.subject}</p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted">{draft.body}</p>
          <div className="mt-3 flex gap-1.5">
            <a
              href={draft.mailto}
              className="rounded bg-accent px-2 py-1 text-[13px] font-medium text-white hover:opacity-90"
            >
              Open in mail
            </a>
            <Action onClick={onSent} busy={busy === "sent"}>Mark sent</Action>
          </div>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">What happened?</p>
        <div className="flex flex-wrap gap-1">
          {OUTCOMES.map((o) => (
            <button
              key={o}
              type="button"
              disabled={busy === o}
              onClick={() => onOutcome(o)}
              className="rounded border border-line px-2 py-0.5 text-[11px] text-muted transition-colors duration-150 hover:border-cyan hover:text-body disabled:opacity-50"
            >
              {OUTCOME_LABELS[o]}
            </button>
          ))}
        </div>
      </div>

      {timeline.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-faint">Timeline</p>
          <ul className="space-y-1">
            {timeline.slice(0, 6).map((t, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-faint">
                  {new Date(t.at).toLocaleDateString([], { day: "numeric", month: "short" })}
                </span>
                <span className="text-muted">{t.type}</span>
                <span className="ml-auto text-faint">{t.actor ?? ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The card's value, editable in place (PRD §5).
 *
 * Read-only everywhere until now: nothing in the app could write
 * `opportunities.value`, so a wedge could never be re-priced as the scope grew,
 * and the wedge→core conversion the §7 scoreboard counts could never happen.
 */
function ValueField({
  card,
  onSaved,
}: {
  card: PipelineCardRow;
  onSaved: (patch: Partial<CardPatch>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [thousands, setThousands] = useState(String(Math.round(card.value / 1000)));
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState(card.tier);
  const [value, setValue] = useState(card.value);

  async function save() {
    const next = Number(thousands) * 1000;
    if (!Number.isFinite(next) || next < 0) return toast.error("Value must be a number.");
    if (next === value) return setEditing(false);

    setBusy(true);
    try {
      const r = await setCardValue(card.id, next);
      if (!r.ok) return toast.error(r.message);
      setValue(r.value);
      setTier(r.tier);
      setEditing(false);
      onSaved({});
      toast.success(`${card.account} is now ${fmtValue(r.value)}`, {
        description: `${r.tier}${r.whale ? " · whale" : ""}`,
      });
    } catch {
      toast.error("Could not save that value");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-baseline gap-2">
        <dt className="w-24 shrink-0 text-[11px] text-faint">Value</dt>
        <dd className="num flex-1 text-[13px] text-body">
          {fmtValue(value)} · {tier}
        </dd>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-[11px] text-faint transition-colors hover:text-accent"
        >
          edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-24 shrink-0 text-[11px] text-faint">Value</dt>
      <dd className="flex flex-1 items-center gap-1">
        <span className="text-[13px] text-faint">$</span>
        <input
          autoFocus
          value={thousands}
          inputMode="numeric"
          onChange={(e) => setThousands(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="num w-20 rounded border border-line bg-canvas px-1.5 py-0.5 text-[13px] text-body"
          aria-label="Value in thousands"
        />
        <span className="text-[13px] text-faint">K</span>
      </dd>
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="text-[11px] text-accent disabled:opacity-40"
      >
        {busy ? "…" : "save"}
      </button>
    </div>
  );
}

function Field({ label, value, num, faint, tone }: { label: string; value: string; num?: boolean; faint?: boolean; tone?: "amber" }) {
  return (
    <div className="flex gap-2 text-[13px]">
      <dt className="w-20 shrink-0 text-faint">{label}</dt>
      <dd className={cn("min-w-0 flex-1", num && "num", faint ? "text-faint" : "text-body", tone === "amber" && "text-amber")}>
        {value}
      </dd>
    </div>
  );
}

function Action({ onClick, busy, primary, children }: { onClick: () => void; busy?: boolean; primary?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "rounded px-2 py-1 text-[13px] font-medium transition-opacity duration-150 disabled:opacity-50",
        primary ? "bg-accent text-white hover:opacity-90" : "border border-line text-body hover:bg-surface",
      )}
    >
      {busy ? "…" : children}
    </button>
  );
}
