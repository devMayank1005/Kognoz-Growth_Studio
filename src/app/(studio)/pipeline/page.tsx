import Link from "next/link";

import { PipelineTable } from "@/components/studio/pipeline-table";
import { loadPipeline, type PipelineCardRow } from "@/db/queries";
import { practiceById, TOWERS } from "@/domain/practices";
import { requireSession } from "@/lib/session";

/**
 * Pipeline (PRD §9.9), with the filters that complete acceptance #7 —
 * "clicking a row filters the table".
 *
 * `searchParams` is a Promise in Next 16 and must be awaited.
 */
export default async function PipelinePage(props: PageProps<"/pipeline">) {
  const session = await requireSession();
  const params = await props.searchParams;

  const filter = readFilter(params);
  const all = await loadPipeline(session.orgId);
  const cards = filter ? all.filter(filter.match) : all;

  const open = cards
    .filter((c) => !["Won", "Lost"].includes(c.stage))
    .reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="px-6 py-8">
      <div className="mb-5 flex flex-wrap items-baseline gap-3">
        <h1 className="font-display text-xl tracking-tight text-body">Pipeline</h1>
        <span className="num text-[13px] text-muted">
          {cards.length} card{cards.length === 1 ? "" : "s"} · ${Math.round(open / 1000)}K open
        </span>

        {/* The operator must never be looking at a subset without knowing it. */}
        {filter && (
          <Link
            href="/pipeline"
            className="group flex items-center gap-1.5 rounded-full border border-cyan px-2.5 py-0.5 text-[11px] text-body"
          >
            <span className="text-faint">{filter.label}:</span>
            {filter.value}
            <span className="text-faint transition-colors group-hover:text-danger">✕</span>
          </Link>
        )}
      </div>

      <PipelineTable cards={cards} />

      {filter && cards.length === 0 && (
        <p className="prose-chat mt-4 text-muted">
          Nothing in the pipeline matches that filter yet.{" "}
          <Link href="/pipeline" className="text-accent underline underline-offset-2">
            Show everything
          </Link>
          .
        </p>
      )}
    </div>
  );
}

interface Filter {
  label: string;
  value: string;
  match: (c: PipelineCardRow) => boolean;
}

/** One filter at a time — the dashboard links to exactly one dimension. */
function readFilter(params: Record<string, string | string[] | undefined>): Filter | null {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v ? v : null;
  };

  const tower = one("tower");
  if (tower) {
    return {
      label: "Tower",
      value: TOWERS[tower as keyof typeof TOWERS]?.short ?? tower,
      match: (c) => c.tower === tower,
    };
  }

  const country = one("country");
  if (country) return { label: "Market", value: country, match: (c) => (c.country || "Unassigned") === country };

  const practice = one("practice");
  if (practice) {
    return {
      label: "Solution",
      value: practiceById(practice)?.name ?? practice,
      match: (c) => (c.practiceId || "Unassigned") === practice,
    };
  }

  const stage = one("stage");
  if (stage) return { label: "Stage", value: stage, match: (c) => c.stage === stage };

  return null;
}
