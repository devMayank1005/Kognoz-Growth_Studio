"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  dispatchPacket, generateDraft, loadTimeline, markDraftSent, recordOutcome,
} from "@/app/actions/card-actions";
import { OUTCOMES, OUTCOME_LABELS, type Outcome } from "@/domain/outcomes";
import { practiceById } from "@/domain/practices";
import { stageKind, TOUCH_CAP } from "@/domain/touches";
import { useSelection } from "@/store/selection";
import { cn } from "@/lib/cn";

/**
 * The inspector (PRD §9.9): the selected card as an aligned key-value block,
 * actions in priority order, the outcome grid, and a timeline excerpt.
 *
 * Nothing selected keeps the snapshot — an empty panel teaches nothing (§9.7).
 */

const fmtValue = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(n / 1_000)}K`;

type Timeline = Awaited<ReturnType<typeof loadTimeline>>;

export function InspectorPanel() {
  const card = useSelection((s) => s.card);

  if (!card) {
    return (
      <div className="space-y-1.5">
        <h2 className="font-display text-[13px] text-body">Snapshot</h2>
        <p className="text-[13px] leading-relaxed text-muted">
          Nothing selected. Pick a row in Pipeline, or ask the engine what is moving in a market.
        </p>
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

  const kind = stageKind(card.stage);

  async function onDraft() {
    setBusy("draft");
    const r = await generateDraft(card.id);
    setBusy(null);
    if (r.ok) setDraft({ id: r.draftId, subject: r.subject, body: r.body, mailto: r.mailto });
    else toast.error(r.message);
  }

  async function onSent() {
    if (!draft) return;
    setBusy("sent");
    const r = await markDraftSent(card.id, draft.id, kind);
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    applyPatch(r.patch);
    toast.success(`${card.account} → ${r.patch.stage}`, {
      description: r.rotateOrPark
        ? `Touch ${r.patch.touches} of ${TOUCH_CAP} — rotate the door or park it.`
        : `Touch ${r.patch.touches} of ${TOUCH_CAP}.`,
    });
    setDraft(null);
    loadTimeline(card.id).then(setTimeline);
  }

  async function onPacket() {
    setBusy("packet");
    const r = await dispatchPacket(card.id);
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    applyPatch(r.patch);
    try {
      await navigator.clipboard.writeText(r.text);
      toast.success(`Packet copied — paste to ${card.partner}.`);
    } catch {
      toast.success("Packet ready", { description: "Clipboard blocked; open the card to copy." });
    }
    loadTimeline(card.id).then(setTimeline);
  }

  async function onOutcome(o: Outcome) {
    setBusy(o);
    const r = await recordOutcome(card.id, o);
    setBusy(null);
    if (!r.ok) return toast.error(r.message);
    applyPatch(r.patch);
    toast.success(`${card.account} — ${OUTCOME_LABELS[o]}`);
    loadTimeline(card.id).then(setTimeline);
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-[13px] tracking-tight text-body">{card.account}</h2>
        <p className="text-[11px] text-faint">{card.country || "—"} · {card.industry || "—"}</p>
      </div>

      <dl className="space-y-1">
        <Field label="Value" value={`${fmtValue(card.value)} · ${card.tier}`} num />
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
          {card.touches === 0 ? "Draft first note" : "Draft next note"}
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
