import Link from "next/link";
import dynamic from "next/dynamic";

/**
 * dnd-kit is only needed by the board, but a static import put it in the
 * pipeline bundle for everyone — and the table is the default view.
 */
const Kanban = dynamic(() => import("@/components/studio/kanban").then((m) => m.Kanban));
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

  const isKanban = params.view === "kanban";
  // Keep whatever filter is active when switching view — losing it silently
  // would show a different set of cards under the same chip.
  const toggleHref = (view: "table" | "kanban") => {
    const next = new URLSearchParams();
    if (filter) next.set(filter.dim, filter.raw);
    if (view === "kanban") next.set("view", "kanban");
    const q = next.toString();
    return q ? `/pipeline?${q}` : "/pipeline";
  };

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

        <span className="ml-auto flex gap-1 text-[11px]">
          <Link
            href={toggleHref("table")}
            className={`rounded border px-2 py-0.5 ${!isKanban ? "border-cyan text-body" : "border-line text-muted hover:text-body"}`}
          >
            Table
          </Link>
          <Link
            href={toggleHref("kanban")}
            className={`rounded border px-2 py-0.5 ${isKanban ? "border-cyan text-body" : "border-line text-muted hover:text-body"}`}
          >
            Kanban
          </Link>
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

      {isKanban ? <Kanban cards={cards} /> : <PipelineTable cards={cards} />}

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
  /** Display label, e.g. "Hire". */
  value: string;
  /** The raw query value, so the view toggle can round-trip it. */
  raw: string;
  dim: string;
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
      label: "Tower", dim: "tower", raw: tower,
      value: TOWERS[tower as keyof typeof TOWERS]?.short ?? tower,
      match: (c) => c.tower === tower,
    };
  }

  const country = one("country");
  if (country) return { label: "Market", dim: "country", raw: country, value: country, match: (c) => (c.country || "Unassigned") === country };

  const practice = one("practice");
  if (practice) {
    return {
      label: "Solution", dim: "practice", raw: practice,
      value: practiceById(practice)?.name ?? practice,
      match: (c) => (c.practiceId || "Unassigned") === practice,
    };
  }

  const stage = one("stage");
  if (stage) return { label: "Stage", dim: "stage", raw: stage, value: stage, match: (c) => c.stage === stage };

  return null;
}
