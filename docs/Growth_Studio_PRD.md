# Growth Studio — Product Requirements Document
**Kognoz ▸ Konverz AI · partner-led sales intelligence console**
Version 1.0 · 2 September 2026 · Owner: Kognoz/Konverz leadership · Build target: Claude Code

> This PRD is the contract for building Growth Studio as a real web application, replacing the single-file prototype (`konverz-sales-copilot.jsx`). The prototype is the reference implementation for behaviour, prompts, and UI; this document is the reference for scope, data, integrations, and acceptance.

---

## 0. One-page summary

**Mission.** Close **$20M USD in 18 months** with a lean, partner-led team (4 → 8 → 12 director/partner sellers) across India, Southeast Asia, and the Gulf, by turning market signals into warm, well-timed, partner-sized conversations — and moving every prospect into Zoho without friction.

**What the product is.** A chat-first intelligence console. The operator asks questions in plain language; the engine answers with insight, a chart when a comparison helps, and an **action table** (Solution · Company · Contact · Trigger · Value) where every row has one button: **＋ Add**. Added rows become pipeline cards routed to the right practice tower and partner, valued by tier, and synced to Zoho. A studio layout keeps chat, pipeline table, dashboard, and an inspector visible at once.

**Locked decisions (10-step dialogue).** North star $20M/18mo partner-led · single operator dispatching to four partners (multi-user later) · four practice towers × geography · markets India, PH, MY, ID, VN, SG, UAE, KSA (Thailand and Qatar benched) · daily radar India/UAE/KSA/PH/MY · 70/30 new-to-expand · ICP 2,000+ employees or $100M+ revenue (scaling exception) · 27-signal taxonomy ratified · AMS motion for T2 · reach-out doctrine (below) · stakeholder data rules · KSA worked through the UAE entity · Zoho = system of record · tower split T2 $6M / T3 $5M / T4 $5M / T1 $4M · weekly Monday review.

**v1 scope (8–10 weeks).** Everything the prototype does, on a real backend: auth, persistence, scheduled sweeps, chat with structured tables, direct add, pipeline table (+ Kanban) + dashboard + inspector, drafts, packets, doctrine automation, **Zoho two-way sync via OAuth**, activity timeline, Today queue, ⌘K, Account page — all in the **"Briefing Room"** design (Section 9).

---

## 1. Users, roles, jobs-to-be-done

| Role | v1 | Jobs |
|---|---|---|
| **Operator** (the founder/leader) | Yes | Read the morning brief; ask the engine; add prospects; route packets to partners; keep Zoho true; run Monday review |
| **Partner** (tower owner) | v1.1 (read/act on own book) | Receive packets; draft/send notes under own name; log outcomes; weekly POV |
| **Viewer** (leadership/finance) | v1.1 | Dashboard and revenue math only |
| **Admin** | Yes | Settings: partners, towers, ICP, radar markets, Zoho, DNC |

Primary JTBD, in order of frequency: *"What should I act on today?"* → *"Add this company with the right solution and value"* → *"Draft the note / packet"* → *"Push to Zoho"* → *"How are we tracking against $20M?"*

---

## 2. Information architecture (studio layout)

```
┌ Top bar: status · M{n}/18 · open · closed vs pace · due today · [Push N to Zoho] · inspector toggle ┐
│ Rail            │ Workspace                                            │ Inspector (right, 320px)     │
│ • Chat          │ Chat: thread, charts, action tables, drafts, ⌘K     │ Selected card: detail + all  │
│ • Today (new)   │ Today: due, beat-2 ripening, partner silence, AMS   │ actions; else Snapshot       │
│ • Pipeline      │ Pipeline: full-width table + Kanban toggle          │                              │
│ • Dashboard     │ Dashboard: 2×2 panels (tower/geo/solution/stage)    │                              │
│ • Accounts      │ Accounts: universe + radar finds, dossier, timeline │                              │
│ • Settings      │ Settings                                             │                              │
└ Status line: sweep progress · triggers today · last Zoho sync · job errors ─────────────────────────┘
```
Mobile: rail → bottom tabs; inspector → bottom sheet; tables scroll horizontally.

---

## 3. Data model (Postgres)

```
organizations(id, name, program_start, targets_json, zoho_org_id)
users(id, org_id, email, name, role[operator|partner|viewer|admin], tower, signature_name, signature_title)
towers: T1 Org & Family (org,family,talent,culture) · T2 HR Tx & Darwinbox (hrtx,worktx) · T3 Hire (hire) · T4 Nurture/Learn (nurture,learncoach,skills)
practices(id, tower, brand[kognoz|konverz], name, buyer, pain, proof_short, signals[])
accounts(id, org_id, name, country, segment, industry, engine[Hire|Learn], status[client|prospect|discovered], anchor, first_seen, evidence, zoho_account_id)
signals(id, account_id, code[H1..L15], tier, headline, evidence, url, date, confidence, sweep_id, dismissed_at)
sweep_runs(id, org_id, started_at, finished_at, kind[standard|radar], market, items_found, errors)
people(id, account_id, name, role, source, verified_at, zoho_contact_id)    -- NO personal contact fields by design
opportunities(id, org_id, account_id, practice_id, tower, partner_user_id, stage, tier[wedge|core|whale], value, whale, contact_person_id|contact_role,
              signal_code, evidence, url, next_step, due_on, touches, dispatched_at, created_by, created_at, updated_at,
              zoho_lead_id, zoho_deal_id, zoho_synced_at)
activities(id, opportunity_id|account_id, type[added|draft|sent|packet|replied|meeting|proposal|park|won|lost|note|zoho_push], payload_json, actor_id, at)
drafts(id, opportunity_id, kind, subject, body, sent_at, actor_id)
insights(id, org_id, dim[tower|geo|industry], key, pattern, play, first, at)
threads(id, user_id, messages_json)   -- chat history per user
dnc(id, org_id, name, kind[company|person], reason, added_by, at)
settings(org_id, icp_text, radar_markets[], mix_new_ratio, zoho_bcc, doctrine_json)
```
Stages: `Prospect` (= Zoho **Lead**) → `Plan reach-out` (Tagged) → `Reached out` (Contacted) → `In conversation` (Talking) → `Meeting set` → `Proposal` → `Won` / `Lost` (= Zoho **Deal** stages Qualification → Needs Analysis → Value Proposition → Proposal/Price Quote → Closed Won/Lost).

---

## 4. Intelligence engine

### 4.1 Sweeps (scheduled, server-side)
- **Standard sweeps (6), daily 05:30 local:** leadership moves · hiring & expansion (SEA + India) · conglomerate & family moves · capability/HCM go-lives incl. **Darwinbox go-lives 6–18 months back (AMS)** · CXO exits · Gulf (UAE + KSA).
- **Market radar (5 daily, configurable):** India, UAE, Saudi Arabia, Philippines, Malaysia — hunts the whole market against the ICP, no priority list; new companies prefixed and absorbed into `accounts` as `discovered`.
- Each sweep = one model call with web search returning JSON items (schema in prototype `SWEEP_SYS`). Retries ×2; errors logged to `sweep_runs.errors`; status visible in the console (progress i/n; failure message with **run the sweep again**).
- Budget guard: max calls/day per org (default 60) — soft, logged, not operator-facing.

### 4.2 Signals (27, ratified) — code · engine · plain description · tier · window (days)
H1 mass-hiring number 1/42 · H2 posting spike 1/56 · H3 new GCC 1/90 · H4 branch/market expansion 1/90 · H5 new TA head/CHRO at volume hirer 1/90 · H6 recruitment RFP 1/60 · H7 nationalization quotas 1/90 · H8 attrition pain 2/90 · H9 licence expansion 2/120 · H10 campus drives 3/30 · H11 store expansion 2/120 · L1 new CHRO/CLO 1/90 · L2 leadership academy 1/56 · L3 M&A 1/270 · L3b demerger 1/270 · L4 family succession 1/365 · L5 mega-project/plant 1/180 · L6 HCM go-live 1/180 (**does not decay for T2 — resurfaces at 180–540 days as an AMS play**) · L7 enterprise AI program 2/180 · L8 professional CEO 2/180 · L9 capability gaps in annual report 2/365 · L10 IPO/PE 2/365 · L11 nationalization commitments 2/180 · L12 leadership talking talent 3/90 · L13 skills-based org 1/180 · L14 industry transition 2/270 · L15 CXO exit, no successor 1/120.

### 4.3 Targets & ranking
`score = tierWeight(40/22/8) + 35 × freshness(1 − age/window) + relationship(new 12 · client 8 · watch 5)`; AMS rows fixed at 30; recent radar finds without a live signal included for 14 days. One row per account (best signal). Industry bucket via regex map (Banking, Insurance, NBFC & Finance, BPO/GCC/IT, Retail & QSR, Real Estate, Industrial & Energy, Conglomerate & Family, Pharma & Health, Telecom & Tech, Other).

### 4.4 Chat engine (the front door)
- Model: `claude-sonnet-4-6` with web search; system prompt = `ENGINE_SYS` + **live state** (today's triggers, verified people, pipeline, program numbers, partners).
- **Mandatory structured tail:** `ENGINE_JSON: {"chart": {...}|null, "rows":[{solution, company, contact_name, contact_title, country, industry, trigger, signal, value, url}]}`. Rows only for concrete companies with real triggers (max 8); contact_name only when known from live state or a search result naming the person.
- **Fallback (never lose the ＋ Add):** if no rows, derive rows from prose mentions of known accounts; infer solution from the clause naming the company (Darwinbox/HCM → HR Tx; hires/quota → Hire; succession/family → Family; academy → Learn+Coach; skills → Skills; pipeline/exit gap → Talent; M&A → Org; culture/attrition → Culture; AI program → Work Tx).
- **Local intents (no model call):** `pipeline`, `pipeline by practice|geography|solution|stage`, `what's due today`, `who should I open first`, `what's moving in {market}`, `add {company} [for {solution}] [at {value}]`, `run the sweep again`.
- **Morning brief** posts itself after the sweep: counts, chart of triggers by market, top-6 rows.
- **Insight synthesis** (daily per tower, on-demand per geo/industry): pattern → play → open-first (`INSIGHT_SYS`).

### 4.5 Drafting (`MAIL_SYS`) — kinds
first-touch (<130 words; trigger → KPI implication → matched proof → partner-sized ask) · congrats (<60 words, zero ask — beat 1) · follow-up · value-add · meeting-confirm · proposal-nudge · linkedin-pov (120–180 words, partner voice). Saudi targets: sender writes from the UAE office. Plain text first; branded HTML for later touches only.

### 4.6 Doctrine (automated where possible)
Warm path first (who could introduce?) · two-beat CHRO play (L1/H5 ≤10 days → congrats now, beat 2 auto-due +21d) · 3-touch cap per door → rotate or park 90d (flash at 3) · partner-sized asks (never "demo" except volume hiring) · quarterly roundtable per market + weekly partner POV (v1.1 workflows) · WhatsApp only warm · KSA via UAE.

---

## 5. Pipeline logic
- **Direct add only.** `makeCard(row, partnerOf, stage)`: practice → tower → partner; value → tier (wedge <$250K / core / whale ≥$500K); contact = name (title) or target role; Prospect stage unless operator intent (chat `add …`, quick-add box → Tagged).
- **Promotions:** sending a draft → Reached out; dispatching a packet → Tagged; outcomes via the grid (Replied → Talking; Meeting; Quiet; Proposal; Park 90d; Won; Dead).
- **Dedup** by account among live cards; **DNC** blocks add everywhere.
- **Values:** editable; wedge→core conversion logged when a card crosses $250K from <$100K; whale toggle sets ≥$500K.
- **Partner packet:** plain-text block (account, tower → partner, value/tier, trigger + source, take-them line, door, warm path, draft) copied to clipboard; `dispatched_at` set; "with partner Nd" badge, red after 3 days; re-send.
- **Activity timeline (new in v1):** every add/draft/sent/packet/outcome/zoho push with actor and time, on the inspector and account page.
- **Kanban view (new in v1):** stage columns, drag to move, same cards.

---

## 6. Zoho CRM integration (system of record)

### v1 — two-way via OAuth (Zoho CRM API v2+)
- **Auth:** Zoho OAuth (server-side, refresh tokens stored encrypted); org-level connection in Settings.
- **Mapping:** `Prospect` ↔ **Leads** (Company, First/Last Name from a *named* contact only, Designation, Country, Industry, Lead Source "Growth Studio", Description = solution · trigger · value · tower · partner) · all other stages ↔ **Deals** (Deal Name "{account} — {practice}", Account Name, Stage map, Amount, Closing Date = due or +90d, Contact Name only if named, Next Step, Description) · `people` ↔ **Contacts** (name, title, account; no emails/phones written) · `activities` sent/meeting/won ↔ **Notes/Activities**.
- **Sync rules:** push on change (debounced 5s) + hourly reconcile; pull stage/amount changes hourly and apply if newer; conflict = last write wins with an activity entry; per-card `zoho_synced_at` and status pill; header count of pending; **Push now** button; BCC dropbox still supported for mail logging.
- **Fallback:** CSV export (Leads + Deals files) remains available.

---

## 7. Revenue math & dashboard
- Curve: ~$1.5M by M6 · $6.5M by M12 · $20M by M18 (linear segments); pace shown vs closed.
- Tower targets: T2 $6M · T3 $5M · T4 $5M · T1 $4M.
- Dashboard panels: by tower (with targets) · geography · solution · stage; each chart + table; click → filtered pipeline.
- Scoreboard (weekly, Monday): pipeline-$ created, meetings, new-logo relationships, wedge→core conversions, reply rate per angle/market. Day-90 bar: $5M qualified pipeline · 40 meetings · 25 new logos · 2–3 wedge closes · ≥1 whale per tower. Monthly kill-or-boost by pipeline-$ per signal family.

---

## 8. Compliance & data rules (hard)
- Stakeholder data = **name, title, company, date, public source only**. No emails, phones, addresses, personal socials — not collected, not stored, not searched for. Corporate generic mailboxes (info@/hr@/careers@) only when company-published; never pattern-guessed.
- Shared **do-not-contact** list (company/person) enforced on add, draft, and packet.
- Full transparency across users (ownership governs action, not sight).
- Saudi outreach through the UAE entity; drafts reference the UAE office.
- Posture conservative under India DPDP, SEA PDPAs, UAE/KSA PDPL. Audit log on every write.

---

## 9. Design & experience specification — theme "Briefing Room"

### 9.1 Concept
Growth Studio should feel like the best briefing memo a chief of staff ever handed a partner: **editorial intelligence**, not a SaaS dashboard. Paper-white surfaces, ink typography, numbers as the typographic hero, sources as footnotes, and two brand colors with a strict grammar. Reference points: Linear (density, keyboard), Attio/Clay (table + side-peek, enrichment per row), Stripe Dashboard (numerals, restraint), Claude (prompt as front door).

### 9.2 Color grammar (brand-aligned)
| Token | Hex | Meaning |
|---|---|---|
| Ink (Kognoz) | `#0B1E2D` | All primary text, wordmark, dark theme surface |
| Paper | `#FBFCFD` | App background (cool-tinted white) |
| Panel | `#F6F8FA` | Rail, inspector, table header, chat user bubble |
| Line | `#E3E8EE` | All borders (1 px, never heavier) |
| Muted / Faint | `#5A7284` / `#8CA2B0` | Secondary / tertiary text |
| **Kognoz Blue** | `#005184` | **Human judgement & action:** primary buttons, links, active nav, partner moves, curve line, T1/T2 accents |
| **Konverz Cyan** | `#009DBF` | **Machine intelligence & signal:** a 2-px cyan hairline on any engine-generated block, tier-1 signal dot, chart bars, ▸ in wordmark, T3/T4 accents, focus rings |
| Konverz Bright | `#22C3E6` *(confirm from logo SVG)* | Hover on cyan elements; gradient end for Konverz-branded exports only |
| Kognoz Green | fill `#75A02F` · text `#4F7A1B` | **Only** won, synced, verified |
| Amber / Red | `#B45309` / `#C0392B` | Pending sync, overdue, destructive |

Rules: chrome is neutral; color is meaning. Never two brand colors on one element. No gradients in-app. Contrast ≥ 4.5:1 for all text.

### 9.3 Typography
- **Poppins 600** — wordmark, workspace titles, the morning brief headline only (brand voice).
- **Inter** — everything else: 13 px UI, 14 px body, 15 px chat prose (max 68 ch line length), 11 px meta; tabular numerals (`font-variant-numeric: tabular-nums`) on every money and count column.
- Insight text in chat renders as prose with generous line height (1.65); the engine's *pattern → play → open first* blocks render as an indented aside with the cyan hairline.

### 9.4 Layout & density
8-px grid; three-pane studio (rail 56/176 px · workspace fluid · inspector 320 px); tables full-bleed with 32-px rows, sticky headers, right-aligned numerals; cards only for the inspector and dashboard panels — never cards-within-cards. Breakpoints: ≥1280 three panes; 768–1279 rail + workspace, inspector as drawer; <768 bottom tabs + sheets.

### 9.5 Signal & trust language
- Tier-1 signal = filled cyan dot; tier-2 = outlined; age shown as text ("3 days ago"), turning amber inside the last 20 % of the window.
- Every fact carries a **source** link and an **as-of** date; contacts carry a **verified** badge (green) or *to identify*; engine-inferred solutions carry an *engine-suggested* label until edited.
- Radar finds carry a *new to us* tag; clients carry *client*; DNC carries a red *do not contact* lock and disables every action.

### 9.6 Motion & feedback
150–200 ms ease-out fades only; one 2-s green pulse on a newly added row; toasts are confirmations, never questions; destructive actions get a 6-s **Undo** toast instead of a confirm dialog. Sweep progress is a thin cyan bar under the top bar (i/n).

### 9.7 Voice & microcopy
Chief-of-staff voice: direct, plain, evidence-first. Buttons are verbs ("＋ Add", "Draft first note", "Packet → Meera"). Empty states teach exactly one action. Banned words in UI and prompts: leverage, synergy, end-to-end, solution-as-a-noun.

### 9.8 Themes & accessibility
Light "Briefing Room" default; optional **"Late shift"** dark theme (Ink surface, paper text, same grammar) for evening reviews. WCAG 2.1 AA; full keyboard coverage; cyan focus rings; `prefers-reduced-motion` honoured.

### 9.9 Screen specifications
**Morning Brief (first message of the day, in Chat).** Poppins headline with counts ("23 triggers · 6 fresh tier-1 · 4 new to us"); bar chart of triggers by market; the action table; a cyan hairline marks it as engine-authored; a "Read the pattern by tower" row of chips beneath.

**Chat.** Prompt composer fixed at bottom with ⌘K also opening it; suggestion chips adapt to state; every engine reply = prose → optional chart → action table → footnote sources. Rows: ＋ Add (blue) / ✓ Draft (after add). Drafts render as editable memo blocks with *Open in mail · BCC Zoho*.

**Today.** Four stacked lists with counts: Due now · Beat-2 ripening (day 21 after a congratulation) · With partners > 3 days · AMS windows opening. Each row = one primary action. This is the Monday review's first screen.

**Pipeline.** Table default (Company · Solution · Stage · Value · Partner · Contact · Next · Zoho) with stage chips, quick-add box, dashboard filter chip, keyboard nav (↑↓ Enter A); Kanban toggle with drag between stages; bulk select → push to Zoho / dispatch.

**Dashboard.** 2×2 panels (tower vs target · geography · solution · stage), each a single-hue chart + table; the $20M curve as a blue line with closed-to-date; click any row → filtered pipeline.

**Account page.** Header (name, market, industry, status), Why now (signals with sources), The play (solution, angle, proof), Who (warm path, verified people, official channels only), Timeline (every activity), Actions.

**Inspector.** Selected card: value / solution / stage / partner / contact / next as an aligned key-value block; actions in priority order; outcome grid; timeline excerpt; Zoho status. Nothing selected: snapshot, due today, recently added, push button.

**Settings & first run.** Three-step onboarding (partners per tower → signature → Zoho connect); then ICP text, radar markets, program clock, DNC, theme.

---

## 10. Architecture & stack (recommended)
- **Next.js (App Router) + TypeScript**, Tailwind, shadcn/ui.
- **Postgres** (Supabase or Neon) with Prisma; row-level security by org.
- **Auth:** Google/Microsoft SSO via Supabase Auth or NextAuth; roles in `users`.
- **Jobs:** Inngest (or Supabase cron + edge functions) for sweeps, insight synthesis, Zoho reconcile, reminders.
- **AI:** Anthropic SDK server-side (`claude-sonnet-4-6`, web search tool); prompts versioned in `/prompts`; structured tails parsed server-side with fallbacks; per-org daily budget.
- **Zoho:** OAuth app; sync worker; idempotent upserts keyed by `zoho_*_id`.
- **Observability:** job logs, prompt/response logging with PII guard (none expected), cost per call.
- **Environments:** dev / staging / prod; seed script loads the 130-account universe, 6 verified people, market playbooks.

---

## 11. Non-functional
Performance: chat answer ≤ 8 s p50 (local intents instant); table renders 1,000 rows. Security: encrypted tokens, RLS, audit log. Reliability: sweeps degrade gracefully (partial results, visible errors). Cost: ≤ ~60 model calls/org/day baseline.

---

## 12. Acceptance criteria (v1)
1. Morning brief posts automatically after the scheduled sweep with counts, chart, and ≥1 row when triggers exist; failures are stated with a retry.
2. Every engine answer naming a known company shows an action table with **＋ Add**; adding creates a routed, valued card visible in Pipeline within 1 s and highlighted.
3. `add Emaar for Hire at 300K` creates a Tagged card with practice Hire, tower T3, the T3 partner, $300K.
4. Draft → Open in mail (BCC) → card moves to Contacted, touches +1; 3rd touch shows the rotate/park notice; congrats sets beat 2 at +21 days.
5. Packet copies the full plain-text block and marks the card "with partner"; >3 days shows red.
6. Zoho: a Prospect appears as a Lead within 10 s of add; promoting to Tagged converts to a Deal; amount/stage changes sync both ways within the hour; pending count and per-card status are accurate; CSV fallback works.
7. Dashboard panels reconcile to the pipeline totals; clicking a row filters the table.
8. Inspector shows full detail and every action for the selected card; snapshot when none.
9. No field anywhere accepts or displays personal contact details; DNC blocks add/draft/packet.
10. Mobile: bottom tabs, inspector sheet, tables scroll; all acceptance flows work on a 390-px screen.

---

## 13. Roadmap after v1
v1.1 partner multi-user (own book, packets received in-app, POV studio, roundtable planner) · v1.2 learning loop (reply rate per angle/market, kill-or-boost automation) · v1.3 WhatsApp digest via approved provider · v2 book transfer at partner onboarding, forecasting.

## 14. Open items
Konverz exact brand hexes (logo file) · Zoho edition/API limits · sending domain(s) for partners · whether viewers see values · Thailand/Qatar re-activation criteria.

## Appendix — reference
Prototype: `konverz-sales-copilot.jsx` (prompts `ENGINE_SYS`, `MAIL_SYS`, `SWEEP_SYS`, `INSIGHT_SYS`; `enrichTargets`, `rowsFromMentions`, `makeCard`, `localAnswer`). Decision log and version history: `Kognoz_Konverz_Intelligence_Platform_Spec.md`. Signal playbook: `Kognoz_Konverz_Signal_Playbook_v1_1.md`.
