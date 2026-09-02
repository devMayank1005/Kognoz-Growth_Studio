"use client";

import { useState } from "react";
import { toast } from "sonner";

import { addToDnc, removeFromDnc, renamePartner, saveOrgSettings } from "@/app/actions/settings";
import { ThemeToggle } from "./theme-toggle";

interface TowerRow {
  key: string;
  label: string;
  partner: string;
}

export function SettingsForm({
  towers, icpText, radarMarkets, dailyCallBudget, dnc,
}: {
  towers: TowerRow[];
  icpText: string;
  radarMarkets: string[];
  dailyCallBudget: number;
  dnc: string[];
}) {
  return (
    <div className="mt-8 space-y-10">
      <Partners towers={towers} />
      <OrgSettings icpText={icpText} radarMarkets={radarMarkets} dailyCallBudget={dailyCallBudget} />
      <DncList names={dnc} />
      <Appearance />
      <Zoho />
    </div>
  );
}

/** The rename promised when the placeholders were seeded. */
function Partners({ towers }: { towers: TowerRow[] }) {
  const [names, setNames] = useState(() => Object.fromEntries(towers.map((t) => [t.key, t.partner])));
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <Section title="Partners" note="One partner per tower. Packets and drafts carry these names.">
      <div className="space-y-2">
        {towers.map((t) => (
          <div key={t.key} className="flex items-center gap-2">
            <span className="w-44 shrink-0 text-[13px] text-muted">{t.label}</span>
            <input
              value={names[t.key] ?? ""}
              onChange={(e) => setNames((n) => ({ ...n, [t.key]: e.target.value }))}
              className="flex-1 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
            />
            <button
              type="button"
              disabled={busy === t.key || names[t.key] === t.partner}
              onClick={async () => {
                setBusy(t.key);
                const r = await renamePartner(t.key, names[t.key] ?? "");
                setBusy(null);
                if (r.ok) toast.success(`${t.label} → ${r.name}`);
                else toast.error(r.message);
              }}
              className="rounded border border-line px-2 py-1 text-[13px] text-body hover:bg-panel disabled:opacity-40"
            >
              {busy === t.key ? "…" : "Save"}
            </button>
          </div>
        ))}
      </div>
    </Section>
  );
}

function OrgSettings({ icpText, radarMarkets, dailyCallBudget }: { icpText: string; radarMarkets: string[]; dailyCallBudget: number }) {
  const [icp, setIcp] = useState(icpText);
  const [markets, setMarkets] = useState(radarMarkets.join(", "));
  const [budget, setBudget] = useState(String(dailyCallBudget));
  const [busy, setBusy] = useState(false);

  return (
    <Section title="The engine" note="What the sweeps hunt for, where, and how much they may spend.">
      <label className="block text-[11px] uppercase tracking-wide text-faint">Ideal customer profile</label>
      <textarea
        value={icp}
        onChange={(e) => setIcp(e.target.value)}
        rows={5}
        className="mt-1 w-full rounded border border-line bg-canvas px-2 py-1.5 text-[13px] leading-relaxed text-body"
      />

      <label className="mt-3 block text-[11px] uppercase tracking-wide text-faint">Radar markets (comma separated)</label>
      <input
        value={markets}
        onChange={(e) => setMarkets(e.target.value)}
        className="mt-1 w-full rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
      />

      <label className="mt-3 block text-[11px] uppercase tracking-wide text-faint">Daily model-call budget</label>
      <input
        value={budget}
        onChange={(e) => setBudget(e.target.value.replace(/\D/g, ""))}
        inputMode="numeric"
        className="num mt-1 w-24 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
      />

      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const r = await saveOrgSettings({
            icpText: icp,
            radarMarkets: markets.split(",").map((m) => m.trim()).filter(Boolean),
            dailyCallBudget: Number(budget) || 60,
          });
          setBusy(false);
          if (r.ok) toast.success("Settings saved");
          else toast.error(r.message);
        }}
        className="mt-3 rounded bg-accent px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </Section>
  );
}

/** §8 — the operator-facing half of do-not-contact. */
function DncList({ names }: { names: string[] }) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <Section title="Do not contact" note="Blocks add, draft and packet everywhere. Applies to the whole firm.">
      {names.length === 0 ? (
        <p className="text-[13px] text-faint">Nobody is blocked.</p>
      ) : (
        <ul className="mb-3 space-y-1">
          {names.map((n) => (
            <li key={n} className="flex items-center gap-2 text-[13px]">
              <span className="rounded-full border border-danger px-2 py-0.5 text-[11px] text-danger">do not contact</span>
              <span className="text-body">{n}</span>
              <button
                type="button"
                onClick={async () => {
                  await removeFromDnc(n);
                  toast.success(`${n} removed from the list`);
                }}
                className="ml-auto text-[11px] text-faint hover:text-danger"
              >
                remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className="flex-1 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body placeholder:text-faint"
        />
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason"
          className="flex-1 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body placeholder:text-faint"
        />
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            const r = await addToDnc(name, reason);
            setBusy(false);
            if (r.ok) { toast.success(`${name} blocked`); setName(""); setReason(""); }
            else toast.error(r.message);
          }}
          className="rounded border border-line px-2 py-1 text-[13px] text-body hover:bg-panel disabled:opacity-40"
        >
          Block
        </button>
      </div>
    </Section>
  );
}

function Appearance() {
  return (
    <Section title="Appearance" note="Late shift is the evening theme — same grammar, ink surface.">
      <ThemeToggle />
    </Section>
  );
}

function Zoho() {
  return (
    <Section title="Zoho CRM" note="System of record. Two-way sync is the next phase.">
      <p className="text-[13px] text-amber">Not connected.</p>
    </Section>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-[13px] text-body">{title}</h2>
      <p className="mb-3 text-[11px] text-faint">{note}</p>
      {children}
    </section>
  );
}
