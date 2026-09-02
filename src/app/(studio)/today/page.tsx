import { loadPipeline, loadSignals, loadUniverse } from "@/db/queries";
import { rankTargets } from "@/domain/scoring";
import { amsWindows, dueNow, withPartnerTooLong, PARTNER_SILENCE_DAYS } from "@/domain/today";
import { practicesForSignal } from "@/domain/practices";
import { requireSession } from "@/lib/session";

/**
 * Today (PRD §9.9) — "the Monday review's first screen".
 *
 * Four stacked lists with counts, each row carrying one primary action. The
 * rules live in domain/today.ts and are unit-tested; this only renders them.
 */
export default async function TodayPage() {
  const session = await requireSession();

  const [pipeline, universe, signals] = await Promise.all([
    loadPipeline(session.orgId),
    loadUniverse(session.orgId),
    loadSignals(session.orgId),
  ]);

  const cards = pipeline.map((c) => ({
    id: c.id, account: c.account, stage: c.stage,
    dueOn: c.due, dispatchedAt: "", next: c.next, partner: c.partner,
  }));

  const targets = rankTargets({
    items: signals,
    universe,
    pipeline: pipeline.map((c) => ({ account: c.account, stage: c.stage })),
    history: signals,
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
          <Row key={c.id} primary={c.account} secondary={`${c.next} · ${c.partner}`} action="Open" tone={c.dueOn < today() ? "amber" : undefined} meta={c.dueOn < today() ? "overdue" : "due today"} />
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
          <Row key={c.id} primary={c.account} secondary={c.partner} action="Nudge" tone="amber" meta={`with partner ${c.daysWithPartner}d`} />
        ))}
      </Section>

      <Section title="AMS windows opening" count={ams.length} empty="No AMS windows open right now.">
        {ams.slice(0, 10).map((t) => (
          <Row
            key={t.name}
            primary={t.name}
            secondary={`${practicesForSignal("L6").find((p) => p.id === "hrtx")?.name ?? "AI-Led HR Transformation"} · ${t.country}`}
            action="＋ Add"
            meta={`HCM live ~${Math.round(t.ageDays / 30)} months`}
          />
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

function Row({
  primary, secondary, action, meta, tone,
}: { primary: string; secondary: string; action: string; meta?: string; tone?: "amber" }) {
  return (
    <li className="flex items-center gap-3 border-b border-line py-2 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-[13px] font-medium text-body">{primary}</span>
        <span className="ml-2 text-[13px] text-muted">{secondary}</span>
      </div>
      {meta && (
        <span className={`text-[11px] ${tone === "amber" ? "text-amber" : "text-faint"}`}>{meta}</span>
      )}
      <button
        type="button"
        className="shrink-0 rounded px-2 py-1 text-[13px] font-medium text-accent transition-colors duration-150 hover:bg-panel"
      >
        {action}
      </button>
    </li>
  );
}
