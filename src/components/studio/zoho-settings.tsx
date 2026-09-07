"use client";

import { useState } from "react";
import { toast } from "sonner";

import { disconnectZoho, setZohoDryRun, testZohoConnection, type PreflightCheck } from "@/app/actions/zoho";
import { saveZohoBcc } from "@/app/actions/settings";
import { ZOHO_DC_CODES, ZOHO_DCS } from "@/domain/zoho/dc";
import { rateToDecimal, type MoneyView } from "@/domain/money";
import { currencyCodeOf } from "@/domain/zoho/currency";
import type { ZohoStatus } from "@/db/zoho";

/**
 * The Zoho CRM section of Settings (PRD §6, §9.10).
 *
 * Its own file rather than another 200 lines in `settings-form.tsx`, which is
 * already long.
 */
export function ZohoSettings({
  status,
  bcc,
  dryRun,
  canManage,
  defaultDc,
  money,
}: {
  status: ZohoStatus;
  bcc: string;
  dryRun: boolean;
  canManage: boolean;
  defaultDc: string;
  money: MoneyView;
}) {
  const [dc, setDc] = useState(defaultDc);
  const [checks, setChecks] = useState<PreflightCheck[] | null>(null);
  const [busy, setBusy] = useState<"test" | "disconnect" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function runTest() {
    setBusy("test");
    try {
      const r = await testZohoConnection();
      if (!r.ok) return toast.error(r.message);
      setChecks(r.checks);
      const failed = r.checks.filter((c) => c.state === "fail").length;
      if (failed > 0) toast.error(`${failed} check${failed > 1 ? "s" : ""} need attention`);
      else toast.success("Zoho answered");
    } catch {
      toast.error("Could not reach Zoho", { description: "The server did not answer." });
    } finally {
      setBusy(null);
    }
  }

  async function runDisconnect() {
    setBusy("disconnect");
    try {
      const r = await disconnectZoho();
      if (!r.ok) return toast.error(r.message);
      setChecks(null);
      setConfirming(false);
      toast.success("Zoho disconnected", {
        description: r.revoked
          ? "The token was revoked at Zoho."
          : "Zoho did not confirm the revoke — remove Growth Studio under Connected Apps in Zoho.",
      });
    } catch {
      toast.error("Could not disconnect");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="font-display text-[13px] text-body">Zoho CRM</h2>
      <p className="mb-3 text-[11px] text-faint">
        System of record. Records are only ever created and updated — the integration issues no
        deletes, and only ever writes to records it created itself.
      </p>

      {status.status === "none" && (
        <NotConnected dc={dc} setDc={setDc} canManage={canManage} />
      )}

      {status.status === "unreadable" && (
        <p className="rounded border border-danger/40 bg-danger/5 px-2.5 py-2 text-[13px] text-danger">
          Connected on {status.connectedAt.toISOString().slice(0, 10)}, but this server cannot read
          the stored token. <code>ZOHO_TOKEN_KEY</code> does not match the key it was encrypted with
          {status.envelopeKeyId ? ` (stored ${status.envelopeKeyId}, server ${status.serverKeyId ?? "none"})` : ""}.
          This needs an admin — reconnecting will not help.
        </p>
      )}

      {status.status === "disabled" && (
        <div className="rounded border border-amber/40 bg-amber/5 px-2.5 py-2">
          <p className="text-[13px] text-amber">
            Zoho refused this connection{status.lastError ? `: ${status.lastError}` : "."}
          </p>
          {canManage && <ReconnectLink dc={dc} setDc={setDc} label="Reconnect" />}
        </div>
      )}

      {status.status === "connected" && (
        <div className="space-y-2">
          <p className="text-[13px] text-body">
            {status.zohoOrgName ?? "Connected"}
            <span className="text-faint"> · {ZOHO_DCS[status.dc]?.label ?? status.dc}</span>
            {status.zohoCurrency && <span className="text-faint"> · {status.zohoCurrency}</span>}
          </p>
          <p className="text-[11px] text-faint">
            Connected {status.connectedAt.toISOString().slice(0, 10)}
            {status.lastRefreshAt ? ` · token refreshed ${status.lastRefreshAt.toISOString().slice(0, 16).replace("T", " ")}` : ""}
          </p>
          {status.lastError && <p className="text-[11px] text-amber">Last error: {status.lastError}</p>}

          {/* Stated outright. No operator should have to infer which currency
              left the building — especially when the screen may be showing a
              different one. */}
          {status.zohoCurrency && currencyCodeOf(status.zohoCurrency) !== money.base && (
            <p className="text-[11px] text-muted">
              Amounts are sent to Zoho in {status.zohoCurrency}
              {money.rate
                ? `, converted from ${money.base} at ${rateToDecimal(money.rate.usdToInr)}.`
                : " — but no rate is set, so pushes will refuse rather than send a wrong figure."}
            </p>
          )}

          {canManage && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void runTest()}
                disabled={busy !== null}
                className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
              >
                {busy === "test" ? "Checking…" : "Test connection"}
              </button>

              {/* Destructive, and it revokes a token against the live CRM — so
                  it confirms rather than firing on one click. */}
              {confirming ? (
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void runDisconnect()}
                    disabled={busy !== null}
                    className="rounded border border-danger px-2.5 py-1 text-[13px] text-danger transition-colors duration-150 hover:bg-danger/10 disabled:opacity-40"
                  >
                    {busy === "disconnect" ? "Disconnecting…" : "Yes, disconnect"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(false)}
                    className="px-1 text-[11px] text-faint hover:text-body"
                  >
                    cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="px-1 text-[11px] text-faint transition-colors hover:text-danger"
                >
                  disconnect
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {checks && <Checks checks={checks} />}

      {status.status === "connected" && canManage && <DryRun dryRun={dryRun} />}

      <Bcc bcc={bcc} />

      <div className="mt-5 border-t border-line pt-3">
        <p className="text-[11px] uppercase tracking-wide text-faint">Export for Zoho import</p>
        <p className="mt-1 text-[11px] text-faint">
          Two files in Zoho’s own import format (PRD §6): prospects as Leads, everything past
          prospect as Deals. Same field mapping the API sync uses.
        </p>
        <div className="mt-2 flex gap-2">
          {/* Plain links: the browser must receive the download. */}
          <a href="/api/zoho/export?kind=leads" className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel">
            Leads .csv
          </a>
          <a href="/api/zoho/export?kind=deals" className="rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel">
            Deals .csv
          </a>
        </div>
      </div>
    </section>
  );
}

function NotConnected({
  dc, setDc, canManage,
}: { dc: string; setDc: (v: string) => void; canManage: boolean }) {
  if (!canManage) return <p className="text-[13px] text-amber">Not connected.</p>;
  return (
    <div className="space-y-2">
      <p className="text-[13px] text-amber">Not connected.</p>
      <ReconnectLink dc={dc} setDc={setDc} label="Connect Zoho CRM" />
      <p className="text-[11px] text-faint">
        Tokens are not portable between Zoho data centres. Check yours in the address bar when
        you’re signed in to Zoho CRM — <code>crm.zoho.in</code> is India, <code>crm.zoho.com</code> is the US.
      </p>
    </div>
  );
}

function ReconnectLink({
  dc, setDc, label,
}: { dc: string; setDc: (v: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={dc}
        onChange={(e) => setDc(e.target.value)}
        aria-label="Zoho data centre"
        className="rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body"
      >
        {ZOHO_DC_CODES.map((code) => (
          <option key={code} value={code}>{ZOHO_DCS[code].label}</option>
        ))}
      </select>
      {/* An <a>, not a fetch — the browser has to navigate to Zoho. */}
      <a
        href={`/api/zoho/connect?dc=${dc}`}
        className="rounded bg-accent px-3 py-1 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90"
      >
        {label}
      </a>
    </div>
  );
}

function Checks({ checks }: { checks: PreflightCheck[] }) {
  const tone = { ok: "text-won-text", warn: "text-amber", fail: "text-danger" } as const;
  const mark = { ok: "✓", warn: "!", fail: "✕" } as const;
  return (
    <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
      {checks.map((c, i) => (
        <li key={i} className="text-[12px]">
          <span className={`${tone[c.state]} mr-1.5 font-medium`}>{mark[c.state]}</span>
          <span className="text-body">{c.label}</span>
          <span className="text-faint"> — {c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Bcc({ bcc }: { bcc: string }) {
  const [value, setValue] = useState(bcc);
  const [busy, setBusy] = useState(false);

  return (
    <div className="mt-5 border-t border-line pt-3">
      <label htmlFor="zoho-bcc" className="block text-[11px] uppercase tracking-wide text-faint">
        Email dropbox address
      </label>
      <input
        id="zoho-bcc"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="dropbox-xxxxx@zohocrm.com"
        className="mt-1 w-full rounded border border-line bg-canvas px-2 py-1 text-[13px] text-body placeholder:text-faint"
      />
      <p className="mt-1 text-[11px] text-faint">
        Every “Open in mail” BCCs this address, so the send logs itself against the record. Zoho:
        Setup → Channels → Email → Email Dropbox.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await saveZohoBcc(value);
            if (!r.ok) return toast.error(r.message);
            toast.success(value ? "Dropbox address saved" : "BCC turned off");
          } catch {
            toast.error("Could not save that", { description: "The server did not answer." });
          } finally {
            setBusy(false);
          }
        }}
        className="mt-2 rounded bg-accent px-3 py-1 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

/**
 * Dry run — the switch that decides whether any of this is real.
 *
 * Turning it OFF gets the two-step confirm the disconnect control uses,
 * because that click is the moment Growth Studio starts writing records into a
 * CRM the client's team uses every day, and nothing in this app can take them
 * back out. Turning it back ON is one click: stopping writes needs no warning.
 */
function DryRun({ dryRun }: { dryRun: boolean }) {
  const [on, setOn] = useState(dryRun);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function set(next: boolean) {
    setBusy(true);
    try {
      const r = await setZohoDryRun(next);
      if (!r.ok) return toast.error(r.message);
      setOn(r.dryRun);
      setConfirming(false);
      toast.success(
        r.dryRun ? "Dry run is on" : "Dry run is off — pushes now write to Zoho",
        {
          description: r.dryRun
            ? "Payloads go to the server log. Nothing reaches Zoho."
            : "The next push creates real Leads and Deals in Konverz.",
        },
      );
    } catch {
      toast.error("Could not change that", { description: "The server did not answer." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-3">
      <p className="text-[11px] uppercase tracking-wide text-faint">Dry run</p>

      <p className={`mt-1 text-[13px] ${on ? "text-amber" : "text-body"}`}>
        {on
          ? "On — pushes are checked and logged, and nothing is written to Zoho."
          : "Off — pushes create and update real records in Zoho."}
      </p>

      {on ? (
        confirming ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-danger">
              This writes Leads and Deals into the live CRM. Records cannot be unwritten from here.
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => void set(false)}
              className="rounded border border-danger px-2.5 py-1 text-[13px] text-danger transition-colors duration-150 hover:bg-danger/10 disabled:opacity-40"
            >
              {busy ? "…" : "Yes, write to Zoho"}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-1 text-[11px] text-faint hover:text-body"
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
            className="mt-2 rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
          >
            Turn dry run off
          </button>
        )
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => void set(true)}
          className="mt-2 rounded border border-line px-2.5 py-1 text-[13px] text-body transition-colors duration-150 hover:bg-panel disabled:opacity-40"
        >
          {busy ? "…" : "Turn dry run back on"}
        </button>
      )}
    </div>
  );
}
