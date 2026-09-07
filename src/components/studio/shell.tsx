"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Building2,
  CalendarClock,
  MessageSquare,
  PanelRight,
  Settings,
  Table2,
} from "lucide-react";

import { UserMenu, type StudioUser } from "@/components/studio/user-menu";
import { ThemeToggle } from "@/components/studio/theme-toggle";
import { formatClock } from "@/lib/clock";
import { cn } from "@/lib/cn";
import { viewMoney, type MoneyView } from "@/domain/money";
import { useZohoPush } from "@/components/studio/zoho-push";
import { useWorkspace } from "@/store/selection";

/* §2 — the rail. Order matters: it is the operator's daily loop, top to
   bottom, not an alphabetised menu. */
export const NAV = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/today", label: "Today", icon: CalendarClock },
  { href: "/pipeline", label: "Pipeline", icon: Table2 },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/accounts", label: "Accounts", icon: Building2 },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function Rail() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="hidden w-rail-open shrink-0 flex-col gap-0.5 border-r border-line bg-panel p-2 md:flex"
    >
      <div className="px-2 pb-4 pt-2">
        <Wordmark />
      </div>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded px-2 py-1.5 transition-colors duration-150",
              active
                ? "bg-surface font-medium text-accent"
                : "text-muted hover:bg-surface hover:text-body",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * §9.4 — below 768px the rail is hidden, so these are the ONLY navigation.
 * Without them the app is unreachable on a phone, which is what acceptance #10
 * is really about.
 */
export function BottomTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      // The safe-area inset keeps the tabs clear of the iPhone home indicator
      // rather than sitting underneath it.
      className="flex shrink-0 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition-colors duration-150",
              active ? "text-accent" : "text-muted",
            )}
          >
            <Icon aria-hidden className="size-5" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * §9.2 — the ▸ is Konverz cyan, the wordmark is ink. Two colours, one rule each.
 * Stacked deliberately: the two brands sit on one line and the product name
 * beneath, so the lockup never breaks mid-phrase in the 176px rail.
 */
export function Wordmark() {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-display text-[13px] tracking-tight whitespace-nowrap text-body">
        KOGNOZ <span className="text-cyan">▸</span> KONVERZ
      </span>
      <span className="text-[11px] text-muted">Growth Studio</span>
    </span>
  );
}

/* §2 — top bar: programme state on the left, the one pending action on the
   right. Numbers are tabular so they stop jittering as they update. */
export function TopBar({
  month = 1,
  open = 0,
  closed = 0,
  pace = 0,
  dueToday = 0,
  pendingZoho = 0,
  user,
  money,
}: {
  month?: number;
  open?: number;
  closed?: number;
  pace?: number;
  dueToday?: number;
  pendingZoho?: number;
  user?: StudioUser;
  /** Resolved server-side, so the first paint is already in the right currency. */
  money: MoneyView;
}) {
  const behind = closed < pace;
  // Read straight from the store rather than taking a callback: the studio
  // layout is a server component, so it could never pass one — which is why
  // this button did nothing at all until now.
  const toggleInspector = useWorkspace((s) => s.toggleInspector);
  return (
    <header className="flex h-12 shrink-0 items-center gap-5 border-b border-line bg-surface px-4">
      {/* The wordmark replaces the rail's branding on small screens. */}
      <span className="shrink-0 md:hidden">
        <Wordmark />
      </span>
      <Stat label="Month" value={`${month}/18`} />
      <Stat label="Open" value={viewMoney(open, money)} />
      <Stat
        label="Closed vs pace"
        value={viewMoney(closed, money)}
        tone={behind ? "amber" : "won"}
        hint={`pace ${viewMoney(pace, money)}`}
      />
      <Stat label="Due today" value={String(dueToday)} tone={dueToday > 0 ? "amber" : undefined} />

      <div className="ml-auto flex items-center gap-2">
        {pendingZoho > 0 && <ZohoChip pending={pendingZoho} />}
        <button
          type="button"
          onClick={toggleInspector}
          aria-label="Toggle inspector"
          className="rounded p-1.5 text-muted transition-colors duration-150 hover:bg-panel hover:text-body"
        >
          <PanelRight aria-hidden className="size-4" strokeWidth={1.75} />
        </button>
        {user && <UserMenu user={user} />}
      </div>
    </header>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "amber" | "won";
}) {
  return (
    <div className="hidden flex-col leading-tight sm:flex">
      <span className="text-[11px] text-faint">{label}</span>
      <span
        className={cn(
          "num text-[13px] font-medium",
          tone === "amber" && "text-amber",
          tone === "won" && "text-won-text",
        )}
      >
        {value}
        {hint && <span className="ml-1 text-[11px] font-normal text-faint">{hint}</span>}
      </span>
    </div>
  );
}

/** §2 — status line: what the machine is doing, always visible, never modal. */
export function StatusLine({
  sweep,
  triggersToday = 0,
  lastSweepAt,
  lastZohoSync,
  zohoConnected = false,
  error,
}: {
  sweep?: { done: number; total: number };
  triggersToday?: number;
  lastSweepAt?: string | null;
  lastZohoSync?: string;
  /** Distinguishes "connected, nothing synced yet" from "not connected". */
  zohoConnected?: boolean;
  error?: string;
}) {
  const sweeping = sweep && sweep.done < sweep.total;
  return (
    <div className="relative flex h-7 shrink-0 items-center gap-4 border-t border-line bg-panel px-4 text-[11px] text-muted">
      {/* §9.6 — sweep progress is a thin cyan bar, not a spinner or a modal. */}
      {sweeping && (
        <span
          aria-hidden
          // scaleX rather than width: width is a layout property, so animating
          // it re-lays-out the status line on every sweep tick.
          className="absolute inset-x-0 top-0 h-0.5 origin-left bg-cyan transition-transform duration-300"
          style={{ transform: `scaleX(${sweep.done / sweep.total})` }}
        />
      )}
      <span>
        {sweeping
          ? `Sweeping ${sweep.done}/${sweep.total}`
          : lastSweepAt
            ? // Deterministic on both sides. toLocaleTimeString resolved the
              // host's locale and timezone, so server and browser disagreed and
              // the resulting hydration mismatch stripped the saved theme.
              `Last sweep ${formatClock(lastSweepAt)} IST`
            : "No sweep yet today"}
      </span>
      <span className="num">{triggersToday} triggers today</span>
      {/* Three states, not two: "connected but nothing has synced yet" read as
          "not connected", which is wrong the moment the CRM is actually wired
          up and no push has run. */}
      <span>
        Zoho{" "}
        {lastZohoSync ? `synced ${lastZohoSync}` : zohoConnected ? "connected" : "not connected"}
      </span>
      {error && <span className="text-danger">{error}</span>}

      {/* Appearance lives at the far right of the strip: always reachable,
          never floating over the table or the composer. */}
      <div className="ml-auto flex items-center">
        <ThemeToggle variant="icons" />
      </div>
    </div>
  );
}

/**
 * §9.9 — the inspector. Shows the selected card, or a snapshot when nothing
 * is selected. It is never empty: an empty panel teaches nothing.
 */
export function Inspector({ children }: { children?: React.ReactNode }) {
  const inspectorOpen = useWorkspace((s) => s.inspectorOpen);
  if (!inspectorOpen) return null;
  return (
    <aside
      aria-label="Inspector"
      className="hidden w-inspector shrink-0 overflow-y-auto border-l border-line bg-panel p-4 xl:block"
    >
      {children ?? <InspectorSnapshot />}
    </aside>
  );
}

function InspectorSnapshot() {
  return (
    <div className="space-y-1.5">
      <h2 className="font-display text-[13px] text-body">Snapshot</h2>
      <p className="text-[13px] leading-relaxed text-muted">
        Nothing selected. Pick a row in Pipeline, or ask the engine what is moving in a market.
      </p>
    </div>
  );
}

/** §9.4 — the three-pane studio: rail, fluid workspace, 320px inspector. */
export function StudioShell({
  children,
  inspector,
  topBar,
  statusLine,
}: {
  children: React.ReactNode;
  inspector?: React.ReactNode;
  topBar?: React.ReactNode;
  statusLine?: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col bg-canvas text-body">
      {topBar}
      <div className="flex min-h-0 flex-1">
        <Rail />
        <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
        {/* ≥1280: the third pane. Below that the same content arrives as a
            drawer or sheet, so nothing is unreachable (§9.4). */}
        <Inspector>{inspector}</Inspector>
      </div>
      {statusLine}
      <BottomTabs />
    </div>
  );
}

/**
 * The pending chip, which is now a control rather than a claim.
 *
 * It read `title="Zoho is not connected yet"` while permanently disabled. That
 * could never be true: `pendingCount` returns 0 when the connection is missing,
 * so the chip renders only once Zoho IS connected. It told the operator the
 * opposite of the truth about why nothing was happening.
 */
function ZohoChip({ pending }: { pending: number }) {
  const { busy, push } = useZohoPush(pending);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void push()}
      title={`${pending} card${pending === 1 ? " has" : "s have"} changed since their last push — click to push now`}
      aria-label={`Push ${pending} changed cards to Zoho`}
      className="rounded border border-line px-2.5 py-1 text-[13px] text-muted transition-colors duration-150 hover:bg-panel hover:text-body disabled:cursor-not-allowed disabled:text-faint"
    >
      {busy ? "Pushing…" : `${pending} waiting for Zoho`}
    </button>
  );
}
