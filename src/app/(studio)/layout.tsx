import { CommandPaletteMount } from "@/components/studio/command-palette-mount";
import { InspectorPanel } from "@/components/studio/inspector-panel";
import { InspectorSheet } from "@/components/studio/inspector-sheet";
import { StatusLine, StudioShell, TopBar } from "@/components/studio/shell";
import { curveTarget, monthOf } from "@/domain/revenue";
import { db } from "@/db/client";
import { loadAccountOptions, loadPipeline, loadSweepStatus } from "@/db/queries";
import { settings } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { eq } from "drizzle-orm";

export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  // The palette query used to sit outside this batch, adding a whole round trip
  // in series to every page in the studio.
  const [settingsRows, pipeline, sweep, paletteAccounts] = await Promise.all([
    db.select({ programStart: settings.programStart }).from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
    loadPipeline(session.orgId),
    loadSweepStatus(session.orgId),
    loadAccountOptions(session.orgId),
  ]);

  const month = settingsRows[0] ? monthOf(settingsRows[0].programStart) : 1;
  const today = new Date().toISOString().slice(0, 10);
  const live = pipeline.filter((c) => !["Won", "Lost"].includes(c.stage));

  const open = live.reduce((sum, c) => sum + c.value, 0);
  const closed = pipeline.filter((c) => c.stage === "Won").reduce((sum, c) => sum + c.value, 0);
  const dueTodayCards = live.filter((c) => c.due && c.due <= today);
  const dueToday = dueTodayCards.length;
  const pendingZoho = live.filter((c) => !c.zohoSyncedAt).length;
  // loadPipeline already orders by createdAt desc, so this is free.
  const recent = pipeline.slice(0, 5);

  return (
    <StudioShell
      topBar={
        <TopBar
          month={month}
          open={open}
          closed={closed}
          pace={curveTarget(month)}
          dueToday={dueToday}
          pendingZoho={pendingZoho}
          user={{ name: session.name, email: session.email, orgName: session.orgName }}
        />
      }
      inspector={
        <InspectorPanel
          dueToday={dueTodayCards}
          recent={recent}
          openValue={open}
          pendingZoho={pendingZoho}
        />
      }
      statusLine={
        <StatusLine
          triggersToday={sweep.triggersToday}
          lastSweepAt={sweep.lastSweepAt}
          error={sweep.lastError ? "last sweep reported errors" : undefined}
        />
      }
    >
      {children}
      {/* Same panel, delivered as a sheet below 1280px (§9.4). */}
      <InspectorSheet />
      {/* Mounted once here so ⌘K works from every section (§9.9). */}
      <CommandPaletteMount accounts={paletteAccounts} />
    </StudioShell>
  );
}
