import { StatusLine, StudioShell, TopBar } from "@/components/studio/shell";
import { curveTarget, monthOf } from "@/domain/revenue";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { eq } from "drizzle-orm";

export default async function StudioLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();

  const [orgSettings] = await db
    .select({ programStart: settings.programStart })
    .from(settings)
    .where(eq(settings.orgId, session.orgId))
    .limit(1);

  const month = orgSettings ? monthOf(orgSettings.programStart) : 1;

  return (
    <StudioShell
      topBar={<TopBar month={month} open={0} closed={0} pace={curveTarget(month)} dueToday={0} />}
      statusLine={<StatusLine triggersToday={0} />}
    >
      {children}
    </StudioShell>
  );
}
