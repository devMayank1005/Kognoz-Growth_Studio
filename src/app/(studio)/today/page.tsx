import { loadDnc, loadPipeline, loadSignals, loadUniverse } from "@/db/queries";
import { rankTargets } from "@/domain/scoring";
import { amsWindows, dueNow, withPartnerTooLong, PARTNER_SILENCE_DAYS } from "@/domain/today";

import { AmsRow, DueRow, NudgeRow } from "@/components/studio/today-rows";
import { requireSession } from "@/lib/session";
import { loadMoneyView } from "@/lib/money-view";

/**
 * Today (PRD §9.9) — "the Monday review's first screen".
 *
 * Four stacked lists with counts, each row carrying one primary action. The
 * rules live in domain/today.ts and are unit-tested; this only renders them.
 */
export default async function TodayPage() {
  const session = await requireSession();
  const money = await loadMoneyView(session.orgId);

  const [pipeline, universe, signals, dnc] = await Promise.all([
    loadPipeline(session.orgId),
    loadUniverse(session.orgId),
    loadSignals(session.orgId),
    loadDnc(session.orgId),
  ]);

  // The full row, not a slice of it: a Row has to hand a whole PipelineCardRow
  // to the inspector, and the earlier projection threw away everything but six
  // fields — which is why Open could never have worked.
  const cards = pipeline.map((c) => ({
    ...c,
    dueOn: c.due,
    dispatchedAt: c.dispatchedAt,
  }));

  const targets = rankTargets({
    items: signals,
    universe,
    pipeline: pipeline.map((c) => ({ account: c.account, stage: c.stage })),
    history: signals,
    // The AMS list carries ＋ Add buttons, so a blocked company must not appear.
    dnc,
  });

  const due = dueNow(cards);
  const silent = withPartnerTooLong(cards);
  const ams = amsWindows(targets);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="font-display text-xl tracking-tight text-body">Today</h1>
      <p className="prose-chat mt-1.5 text-muted">
        Four things worth your attention, in the order they go cold.
      </p>

      <Section title="Due now" count={due.length} empty="Nothing due. Go hunting.">
        {due.map((c) => (
          <DueRow
            key={c.id}
            card={c}
            tone={c.dueOn < today() ? "amber" : undefined}
            meta={c.dueOn < today() ? "overdue" : "due today"}
          />
        ))}
      </Section>

      <Section
        title="Beat-2 ripening"
        count={0}
        empty="Nothing ripening. This fills once drafts ship — beat 2 falls 21 days after a congratulation."
      >
        {null}
      </Section>

      <Section title={`With partners over ${PARTNER_SILENCE_DAYS} days`} count={silent.length} empty="No packets going quiet.">
        {silent.map((c) => (
          <NudgeRow key={c.id} card={c} meta={`with partner ${c.daysWithPartner}d`} />
        ))}
      </Section>

      <Section title="AMS windows opening" count={ams.length} empty="No AMS windows open right now.">
        {ams.slice(0, 10).map((t) => (
          <AmsRow key={t.name} target={t} meta={`HCM live ~${Math.round(t.ageDays / 30)} months`} money={money} />
        ))}
      </Section>
    </div>
  );
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function Section({
  title, count, empty, children,
}: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 border-b border-line pb-1.5">
        <span className="font-display text-[13px] text-body">{title}</span>
        <span className="num text-[11px] text-faint">{count}</span>
      </h2>
      {count === 0 ? (
        // §9.7 — an empty state teaches, it does not just say "none".
        <p className="mt-2 text-[13px] leading-relaxed text-faint">{empty}</p>
      ) : (
        <ul>{children}</ul>
      )}
    </section>
  );
}

