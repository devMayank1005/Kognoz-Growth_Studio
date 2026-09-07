import { eq } from "drizzle-orm";

import { SettingsForm } from "@/components/studio/settings-form";
import { ZohoSettings } from "@/components/studio/zoho-settings";
import { CurrencySettings } from "@/components/studio/currency-settings";
import { db } from "@/db/client";
import { loadDnc, loadPartnersByTower } from "@/db/queries";
import { loadZohoStatus } from "@/db/zoho";
import { canManageIntegrations } from "@/domain/access";
import { defaultDc } from "@/lib/zoho/config";
import { loadMoneyView } from "@/lib/money-view";
import { settings } from "@/db/schema";
import { TOWERS, TOWER_KEYS } from "@/domain/practices";
import { requireSession } from "@/lib/session";

export default async function SettingsPage() {
  const session = await requireSession();

  const [partners, dncList, cfgRows, zoho, money] = await Promise.all([
    loadPartnersByTower(session.orgId),
    loadDnc(session.orgId),
    db.select().from(settings).where(eq(settings.orgId, session.orgId)).limit(1),
    // Loaded here, not inside SettingsForm: `loadZohoStatus` is the only
    // module allowed near the encrypted columns, and it returns named
    // non-secret fields so nothing token-shaped can reach the client bundle.
    loadZohoStatus(session.orgId),
    loadMoneyView(session.orgId),
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
        currency={
          <CurrencySettings
            money={money}
            fxSource={cfg?.fxSource ?? null}
            manualOverride={cfg?.fxManualOverride ?? false}
            canManage={canManageIntegrations(session.role)}
          />
        }
        zoho={
          <ZohoSettings
            status={zoho}
            bcc={cfg?.zohoBcc ?? ""}
            dryRun={cfg?.zohoDryRun ?? true}
            canManage={canManageIntegrations(session.role)}
            defaultDc={defaultDc() ?? "us"}
            money={money}
          />
        }
      />
    </div>
  );
}
