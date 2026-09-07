import { eq } from "drizzle-orm";

import { SettingsForm } from "@/components/studio/settings-form";
import { db } from "@/db/client";
import { loadDnc, loadPartnersByTower } from "@/db/queries";
import { settings } from "@/db/schema";
import { TOWERS, TOWER_KEYS } from "@/domain/practices";
import { requireSession } from "@/lib/session";

export default async function SettingsPage() {
  const session = await requireSession();

  const [partners, dncList, cfgRows] = await Promise.all([
    loadPartnersByTower(session.orgId),
    loadDnc(session.orgId),
    db.select().from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
  ]);

  const cfg = cfgRows[0];

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="font-display text-xl tracking-tight text-body">Settings</h1>
      <p className="prose-chat mt-1.5 text-muted">
        {session.orgName} · programme started {cfg?.programStart ?? "—"}
      </p>

      <SettingsForm
        towers={TOWER_KEYS.map((t) => ({ key: t, label: `${t} ${TOWERS[t].short}`, partner: partners[t] }))}
        icpText={cfg?.icpText ?? ""}
        radarMarkets={cfg?.radarMarkets ?? []}
        dailyCallBudget={cfg?.dailyCallBudget ?? 60}
        dnc={dncList}
        user={{ name: session.name, email: session.email, orgName: session.orgName }}
        zohoBcc={cfg?.zohoBcc ?? ""}
      />
    </div>
  );
}
