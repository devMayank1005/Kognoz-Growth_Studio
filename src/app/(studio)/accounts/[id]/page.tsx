import Link from "next/link";
import { notFound } from "next/navigation";

import { loadAccountDossier } from "@/db/queries";
import { practiceById, practicesForSignal } from "@/domain/practices";
import { DismissSignal } from "@/components/studio/dismiss-signal";
import { signalByCode } from "@/domain/signals";
import { requireSession } from "@/lib/session";

/**
 * The account dossier (PRD §9.9): Why now · The play · Who · Timeline · Actions.
 *
 * Data-only, deliberately. Everything §9.9 asks for is derivable from what we
 * already hold, and a page that costs a model call per view is a page nobody
 * opens twice.
 */
export default async function AccountPage(props: PageProps<"/accounts/[id]">) {
  const session = await requireSession();
  const { id } = await props.params;

  const dossier = await loadAccountDossier(session.orgId, id);
  if (!dossier) notFound();

  const { account, signals, people, cards, timeline } = dossier;
  const play = practicesForSignal(signals[0]?.code ?? "")[0];

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link href="/accounts" className="text-[11px] text-faint hover:text-body">← Accounts</Link>

      <header className="mt-2">
        <h1 className="font-display text-xl tracking-tight text-body">{account.name}</h1>
        <p className="text-[13px] text-muted">
          {account.country ?? "—"} · {account.industry ?? "—"} ·{" "}
          {account.status === "client" ? "client" : account.status === "discovered" ? "new to us" : "prospect"}
        </p>
      </header>

      <Section title="Why now">
        {signals.length === 0 ? (
          <p className="text-[13px] text-faint">No live signals. The sweeps have not found anything here yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {signals.map((s, i) => {
              const def = signalByCode(s.code);
              return (
                <li key={s.id ?? i} className="flex gap-2.5">
                  {/* §9.5 — tier-1 is a filled cyan dot, tier-2 outlined. */}
                  <span
                    className={`mt-1.5 size-1.5 shrink-0 rounded-full ${
                      s.tier === 1 ? "bg-cyan" : "border border-cyan"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[13px] text-body">{s.headline ?? def?.description ?? s.code}</p>
                    <p className="text-[13px] leading-relaxed text-muted">{s.evidence}</p>
                    <p className="flex items-baseline gap-1.5 text-[11px] text-faint">
                      <span>
                      {s.code} · {s.date}
                      {/* Every fact carries a source, or says it has none. */}
                      {s.url ? (
                        <>
                          {" · "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline underline-offset-2">
                            source
                          </a>
                        </>
                      ) : (
                        " · unsourced"
                      )}
                      </span>
                      {/* A wrong radar find used to rank forever — nothing could
                          write signals.dismissedAt. */}
                      <DismissSignal signalId={s.id} label={s.code} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="The play">
        {play ? (
          <div className="engine-mark">
            <p className="text-[13px] font-medium text-body">{play.name}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{play.pain}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{play.proofShort}</p>
            <p className="mt-1.5 text-[11px] text-faint">Buyer: {play.buyer}</p>
          </div>
        ) : (
          <p className="text-[13px] text-faint">No signal yet, so no obvious angle.</p>
        )}
      </Section>

      <Section title="Who">
        {account.anchor && (
          <p className="mb-2 text-[13px] text-muted">
            <span className="text-faint">Warm path:</span> {account.anchor}
          </p>
        )}
        {people.length === 0 ? (
          <p className="text-[13px] text-faint">
            Nobody verified yet. Names come from public sources only — never guessed.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {people.map((p, i) => (
              <li key={i} className="text-[13px]">
                <span className="text-body">{p.name}</span>
                <span className="text-muted"> — {p.role}</span>
                <span className="ml-2 rounded-full bg-won-bg px-1.5 py-0.5 text-[11px] text-won-text">verified</span>
                <span className="ml-2 text-[11px] text-faint">
                  {p.source}
                  {p.verifiedAt ? ` · ${p.verifiedAt.toISOString().slice(0, 10)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-faint">
          Name, title, company and public source only. No contact details are held (§8).
        </p>
      </Section>

      <Section title="Pipeline">
        {cards.length === 0 ? (
          <p className="text-[13px] text-faint">Not in the pipeline. Add it from Chat or the action table.</p>
        ) : (
          <ul className="space-y-1">
            {cards.map((c) => (
              <li key={c.id} className="flex items-baseline gap-2 text-[13px]">
                <span className="text-body">{practiceById(c.practiceId)?.name ?? c.practiceId}</span>
                <span className="text-muted">{c.stage}</span>
                <span className="num ml-auto text-body">${Math.round(c.value / 1000)}K</span>
                <span className="text-faint">{c.partner ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Timeline">
        {timeline.length === 0 ? (
          <p className="text-[13px] text-faint">Nothing has happened here yet.</p>
        ) : (
          <ul className="space-y-1">
            {timeline.map((t, i) => (
              <li key={i} className="flex gap-2 text-[11px]">
                <span className="w-16 shrink-0 text-faint">
                  {t.at.toISOString().slice(0, 10)}
                </span>
                <span className="text-muted">{t.type}</span>
                <span className="ml-auto text-faint">{t.actor ?? ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="mb-2 border-b border-line pb-1.5 font-display text-[13px] text-body">{title}</h2>
      {children}
    </section>
  );
}
