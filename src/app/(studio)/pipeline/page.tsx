import { loadPipeline } from "@/db/queries";
import { PipelineTable } from "@/components/studio/pipeline-table";
import { requireSession } from "@/lib/session";

export default async function PipelinePage() {
  const session = await requireSession();
  const cards = await loadPipeline(session.orgId);

  const open = cards
    .filter((c) => !["Won", "Lost"].includes(c.stage))
    .reduce((sum, c) => sum + c.value, 0);

  return (
    <div className="px-6 py-8">
      <div className="mb-5 flex items-baseline gap-3">
        <h1 className="font-display text-xl tracking-tight text-body">Pipeline</h1>
        <span className="num text-[13px] text-muted">
          {cards.length} card{cards.length === 1 ? "" : "s"} · ${Math.round(open / 1000)}K open
        </span>
      </div>
      <PipelineTable cards={cards} />
    </div>
  );
}
