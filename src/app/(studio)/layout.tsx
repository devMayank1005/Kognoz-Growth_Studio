import { CommandPaletteMount } from "@/components/studio/command-palette-mount";
import { InspectorPanel } from "@/components/studio/inspector-panel";
import { InspectorSheet } from "@/components/studio/inspector-sheet";
import { StatusLine, StudioShell, TopBar } from "@/components/studio/shell";
import { curveTarget, monthOf } from "@/domain/revenue";
import { pendingCount } from "@/domain/zoho/status";
import { loadZohoStatus } from "@/db/zoho";
import { loadMoneyView } from "@/lib/money-view";
import { db } from "@/db/client";
import { loadAccountOptions, loadPipeline, loadSweepStatus } from "@/db/queries";
import { settings } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { formatClock } from "@/lib/clock";
import { eq } from "drizzle-orm";

export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  // The palette query used to sit outside this batch, adding a whole round trip
  // in series to every page in the studio.
  const [settingsRows, pipeline, sweep, paletteAccounts, zohoStatus, money] = await Promise.all([
    db.select({ programStart: settings.programStart }).from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
    loadPipeline(session.orgId),
    loadSweepStatus(session.orgId),
    loadAccountOptions(session.orgId),
    loadZohoStatus(session.orgId),
    loadMoneyView(session.orgId),
  ]);

  const month = settingsRows[0] ? monthOf(settingsRows[0].programStart) : 1;
  const today = new Date().toISOString().slice(0, 10);
  const live = pipeline.filter((c) => !["Won", "Lost"].includes(c.stage));

  const open = live.reduce((sum, c) => sum + c.value, 0);
  const closed = pipeline.filter((c) => c.stage === "Won").reduce((sum, c) => sum + c.value, 0);
  const dueTodayCards = live.filter((c) => c.due && c.due <= today);
  const dueToday = dueTodayCards.length;
  /**
   * `pendingCount`, not `!zohoSyncedAt`.
   *
   * The old expression reported a card that synced once and was then edited as
   * SYNCED, so the header undercounted exactly the cards most in need of a
   * push. PRD §12 #6 requires this number to be accurate. The rule lives in
   * `src/domain/zoho/status.ts` under test, shared with the pipeline table.
   *
   * `zohoConnected` reads the real connection now. A `disabled` or `unreadable`
   * connection counts as NOT connected here on purpose: nothing can be pushed
   * through it, so promising a pending count would be a lie the operator can
   * do nothing about.
   */
  const zohoConnected = zohoStatus.status === "connected";
  const pendingZoho = pendingCount(live, zohoConnected);

  /**
   * The status line's `lastZohoSync` was a declared prop that nothing ever
   * passed, so the strip read "Zoho not connected" no matter what the data
   * said. Derived from the pipeline rather than stored: the most recent
   * `zohoSyncedAt` IS the last sync, so a `settings.last_zoho_sync` column
   * would be a second copy of a fact we already hold, free to drift.
   */
  const lastSyncedAt = pipeline.reduce(
    (latest, c) => (c.zohoSyncedAt > latest ? c.zohoSyncedAt : latest),
    "",
  );
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
          money={money}
          user={{ name: session.name, email: session.email, orgName: session.orgName }}
        />
      }
      inspector={
        <InspectorPanel
          dueToday={dueTodayCards}
          recent={recent}
          openValue={open}
          pendingZoho={pendingZoho}
          zohoConnected={zohoConnected}
          money={money}
        />
      }
      statusLine={
        <StatusLine
          triggersToday={sweep.triggersToday}
          lastSweepAt={sweep.lastSweepAt}
          lastZohoSync={lastSyncedAt ? formatClock(lastSyncedAt) : undefined}
          zohoConnected={zohoConnected}
          error={sweep.lastError ? "last sweep reported errors" : undefined}
        />
      }
    >
      {children}
      {/* Same panel, delivered as a sheet below 1280px (§9.4). */}
      <InspectorSheet money={money} />
      {/* Mounted once here so ⌘K works from every section (§9.9). */}
      <CommandPaletteMount accounts={paletteAccounts} />
    </StudioShell>
  );
}
