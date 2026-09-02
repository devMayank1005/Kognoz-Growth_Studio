# KOGNOZ + KONVERZ — INTELLIGENCE PLATFORM SPEC v1.0
### Build spec, model-routing economics, and handoff pack — so any model or developer can continue this build

*August 2026 · Companion to Signal Playbook v1.1, the Account Scoring Workbook, and `konverz-sales-copilot.jsx` (v3)*

---

## 1 · WHAT EXISTS (Phase 1, shipped)

| Asset | Purpose |
|---|---|
| **Signal Playbook v1.1** (.md) | The IP: 27-signal taxonomy, ICPs, source directory, stakeholder maps, outreach construction, scoring model |
| **Account Scoring Workbook** (.xlsx) | Source of truth for the ranked 35: 141-account universe, signal log, live COUNTIFS scoring with wallet × access |
| **Sales Intelligence Copilot v3** (.jsx artifact) | The daily surface: auto-sweep Today feed, practice-wide copilot chat, 360 briefs, people directory, shared signal log |

### v3 covers the full catalog — ten practices, one intelligence
Konverz: **Hire** · **Nurture** · **Learn + Coach** · **Skills AI**. Kognoz: **Organization Transformation** · **Family Business** · **Culture & EX** · **Talent & Leadership (Assessments/Succession)** · **AI-Led HR Digital Transformation** · **Work Transformation / Human-AI**. Every feed finding is auto-tagged to its practice(s); the feed filters by practice; 360 briefs recommend best-fit practices; each practice card can query "best-fit accounts now" against live search. New signal **L15** (CXO exit/retirement — succession exposure, tier 1, decay 120d) feeds the Talent & Leadership practice directly, and a seventh sweep batch hunts for it.

---

## 2 · MODEL ROUTING — SPEND TOKENS WHERE THEY EARN

Three layers, three different answers:

### Layer A — the app as it runs today (inside Claude.ai)
Artifact API calls run on **Claude Sonnet 4.6** — this is fixed by the artifact environment and is the right tool anyway. **Salesperson usage of the app does not consume Fable 5 at all.** Fable 5 was spent only on this design conversation (strategy, playbook authoring, app architecture) — which is exactly what a frontier model is for: the thinking, not the running.

### Layer B — self-hosted Phase 2 (your own API key): route by task
When the sweep engine moves to a scheduled server job and the app to your own key, route each call to the cheapest model that does the job well:

| Task | Volume | Model | Model string | Why |
|---|---|---|---|---|
| Daily sweep batches (7/day, structured JSON extraction from search) | High, daily | **Haiku 4.5** | `claude-haiku-4-5-20251001` | Extraction against a tight schema is exactly what a fast small model does well; the SWEEP_SYS prompt constrains it hard. Cheapest line item by far. |
| Copilot chat, 360 briefs, outreach drafts | Medium, interactive | **Sonnet 4.6** | `claude-sonnet-4-6` | Needs judgment + search synthesis + brand voice; Sonnet is the price/quality sweet spot. |
| Monthly deep account dossiers (top 10 accounts), quarterly taxonomy reweighting, playbook revisions | Low, scheduled | **Opus 4.8** | `claude-opus-4-8` | Long-horizon reasoning over the full signal log + market context; worth the premium ~10 times a month, not 100 times a day. |
| Strategy redesign, new-market entry (e.g., KSA activation), major pivots | Rare | Fable 5 (this chat) | — | Frontier thinking on demand; never wired into the pipeline. |

Rule of thumb: **extraction → Haiku, conversation → Sonnet, deliberation → Opus, invention → frontier.** With this routing, ~90% of daily token volume (the sweeps) lands on the cheapest model.

Guardrail: keep the model per task in one config map so a single line changes routing; log tokens per call per task from day 1 so the routing is corrected by data, not intuition.

### Layer C — continuing the build itself
Further development (new tabs, CRM sync, the Phase 2 job) does not need Fable 5 either. Open this spec plus the `.jsx` in **Claude Code**, where you choose the model per session (`/model` — Sonnet 4.6 for most feature work, Opus 4.8 for architecture changes). Everything a model needs to continue is in this document and the three assets — no dependence on this chat's history.

---

## 3 · DATA MODEL (shared storage, single-key batching)

| Key | Shape | Notes |
|---|---|---|
| `kv-intel` | `{date:"YYYY-MM-DD", sweptAt:ISO, items:[Finding], dismissed:[key]}` | One sweep/day, team-shared; first opener triggers, everyone reads. Dismissals team-wide. |
| `kv-signal-log` | `[{account, signal, evidence, url, date, by}]` | Human-confirmed only. Mirrors to the workbook (source of truth for scores). |
| `kv-stakeholders` | `[{name, role, company, src, verified}]` | **Professional public data only — never contact or personal details.** Seeded with 6 verified entries (Aug 2026). |
| `kv-pipeline` | `[{id, account, practice, signal, evidence, url, stage, next, due, created}]` | v4: pipeline cards. Stages: Plan reach-out → Reached out → In conversation → Meeting set → Proposal → Won/Lost. "Add to pipeline" also logs the signal. |
| `kv-settings` | `{zohoBcc, sender, senderTitle}` | v4: Zoho email-dropbox BCC (auto-logs every sent mail to Zoho CRM) + mail signature. |
| `kv-me` (personal) | `{name, targets, xp, streak:{count,last}, claims:{weekKey:[questIds]}}` | v6: private per-person — level/XP/streak/quest claims. Never shared. |
| `kv-activity` (personal) | `[{type: mail\|add\|meeting\|won\|person\|fast, date}]` | v6: private activity ledger feeding rings, quests, XP. Cap 500. |

## Final-version Decision Log (10-step dialogue — restarted at user's request)
First-pass answers, reference only, NOT locked: Step 1 → new-logo meetings, market-first. Step 2 → one shared desk, same view for all.
1. **North star — LOCKED & AMENDED at Step 2: $20M USD in 18 months, partner-led.** Partner-led economics replace volume math: meeting→close 18–25% warm → ~65–90 wins; blended avg must rise to ~$250–350K (the $100K deals become entry wedges inside relationships, with an explicit tracked wedge→core (~$300K+) expansion motion). ~300–350 meetings (~18/mo team; 3–4/partner/mo), ~70 warm signal-timed touches/mo (<1/partner/day). Per partner-year: 5–6 wins ≈ $1.7M. Whale program stands (12–15 closes of $500K+ targeted). Revenue Math strip tracks: pipeline-$, meetings, closed-$, wedge→core conversion.
2. **Primary user & moment — LOCKED, AMENDED at Step 4:** Launch mode = SINGLE OPERATOR (the user) dispatching to four partners who are not yet tool users. Loop: review queue → tag → route to partner with a one-tap forwardable PARTNER PACKET (signal + angle + door + draft, clean text for mail/WhatsApp) → track in a "waiting on partner" lane. Partners onboard as users over time; the earlier partner-self-serve design (named books, relationship moves, warm paths, meeting-prep briefs, personal-brand assists) becomes the multi-user phase.
3. **Team operating model — LOCKED: practice towers × geography.** Four towers, one founding partner each (global in M1–6): T1 Org & Family Business (+talent/succession/culture adjacents) · T2 AI-led HR Transformation & Darwinbox implementation (L6/HCM signals boosted) · T3 Konverz AI Hire (JobFit) · T4 Konverz Nurture/Learn + AI HR consulting (careers/mobility/learning/skills). Geography splits towers as team grows: at 8 → two geo books per tower; at 12 → dedicated leads in heaviest markets. Routing: tower first (via TAKE THEM reco→practice-family map), then geo — AMENDED: near-term routing is manual by the single operator; the engine recommends tower/partner. Misfits → unclaimed lane, weekly desk review. Whales: 2–4/partner, lead + supporting partner on multi-tower groups. New partner at M7 inherits a starter book; ENGINE FEATURE: book transfer with history intact. Open dial → Step 9: $20M split across towers.
4. **Markets & ICP — LOCKED.** Active: India, PH, MY, ID, VN, SG, UAE, KSA. Thailand + Qatar BENCHED (data retained; sweeps/radar/queue exclude). Daily radar: India · UAE · KSA · PH · MY (Malaysia added by user amendment — strongest in-market proof: Petronas, Sime Darby; serves T4 academies, T1 family houses, T2 GLC work). Others on standard sweeps. Mix: 70/30 new-to-expand stands. Signals: 27-signal taxonomy RATIFIED as-is. ICP raised — very small companies out: ~2,000+ employees OR $100M+ revenue, scaling exception (500+ announced hires or IPO/PE); editable block. NEW MOTION (T2): AMS — L6/HCM go-live signals don't decay; 6+ months post go-live they RESURFACE as AMS plays ("live long enough to feel the support gap"); capability sweep additionally hunts Darwinbox go-lives explicitly.
5. **Intelligence economics — PARKED by user:** no operator-dependent budgets or quotas yet; spending stays simple (baseline heartbeat + on-demand); engine remains intelligence-first. Revisit at partner onboarding.
6. **Reach-out doctrine — LOCKED (strawman approved "makes sense"):** (1) warm path first — engine's first question is "who do we know", cold is fallback; (2) cold fallback = signal-timed plain-text personal note <130w from partner's mailbox within 48h of Tier-1, LinkedIn engagement-before-outreach in parallel; (3) two-beat new-CHRO play — congratulate week 1 no ask, substantive note week 3–4; (4) 3-touch cap/person over ~3 weeks → rotate to second door with different angle (sequential) → park 90 days; (5) partner-sized asks (notes exchange / 25 min / coffee / roundtable invite); wedge = second meeting's move; (6) quarterly roundtable per focus market on a live pattern + one engine-drafted POV per partner per week; (7) WhatsApp post-first-contact or via introduction only.
7. **Compliance & data boundary — LOCKED.** (a) Stakeholder rules ratified permanent: names/titles/companies/dates/public sources only; never personal emails/phones; no pattern-guessing; generic corporate mailboxes only when company-published. (b) NEW FEATURE: shared do-not-contact suppression list (person + company level), enforced everywhere, forever. (c) Visibility at partner onboarding: full transparency — all books/rooms/threads visible to all; ownership governs action, not sight. (d) KSA — RESOLVED: outreach routes through the UAE entity; KSA fully workable (no gate); KSA drafts reference the UAE presence; Riyadh events hosted via UAE. Posture conservative under DPDP / SEA PDPAs / UAE & KSA PDPL.
8. **CRM depth — LOCKED: Zoho = system of record; leadership reviews happen in Zoho.** Launch bridge (artifact can't hold OAuth): BCC dropbox auto-logs sent mail + "Sync to Zoho" ritual button — one-tap deals+leads CSV export, tracks lastSyncedAt, shows delta, nags every Friday and any active day until pressed. CONVERGENT FEATURE: every opportunity carries an editable $ value, defaulted by tier (wedge $75K / core $300K / whale $500K) — feeds Zoho pipeline AND the Revenue Math strip. Full two-way Zoho API sync promoted to FIRST Phase 2 item (trigger: partner onboarding).
9. **Learning loop & 90-day success — LOCKED.** Weekly scoreboard ($-denominated): pipeline-$ created, qualified meetings held, new-logo relationships opened, wedge→core conversions, reply rate per angle/market. Monthly kill-or-boost ritual on signal families & angles by pipeline-$ produced. Day-90 bar: ~$5M qualified pipeline · 40+ meetings · 25+ new-logo relationships · 2–3 wedge closes · ≥1 whale engaged per tower. Tower split (user: "Konverz and HR transformation load more"): T2 $6M · T3 $5M · T4 $5M · T1 $4M — fast-cycle towers fund the mid-curve, T1 high-ticket lands late (derisks Step 1's timing inversion). Queue/radar weights and whale mix follow the split.
10. **Launch & final scope — LOCKED: the name is GROWTH ENGINE.** Launch now, single-operator. Weekly ritual: Monday morning, ~20 minutes, Revenue tab first (curve pacing → towers → day-90 bar → kill-or-boost table). Final scope = everything below; Phase 2 order: (1) full Zoho API sync at partner onboarding, (2) partner multi-user mode + book transfer, (3) roundtable & POV workflows, (4) learning-loop automation, (5) WhatsApp digest.

## GROWTH ENGINE v3.0 — chat-first (2 Sep 2026): ask, see, act
**Paradigm:** the thread is the interface (Claude/ChatGPT-style). Desktop: chat left, pipeline panel right; mobile: Chat | Pipeline toggle. Settings behind ⚙.
- **Engine messages** carry prose + optional **chart** (recharts bar/line, from an `ENGINE_JSON` block the model appends) + **lead cards** (account · country · industry · why · practice · value) with one-tap **＋ Add to pipeline**, Dossier, Find the door; once added, the same card offers Draft first/next note (Beat-1 congratulation on fresh CHRO signals).
- **Morning brief posts itself**: after the sweep, the engine writes the first message of the day — trigger counts, chart of triggers by market, five doors to open first.
- **Live state injection**: every prompt goes to the model with today's triggers and the pipeline compacted into the system prompt, so it answers from what the engine already knows and searches only to go deeper. **Local intents** answer instantly without an API call: "pipeline", "what's due today", "who should I open first", "what's moving in {market}".
- **Drafts arrive as messages**: editable subject/body, Open in mail (BCC Zoho dropbox), Copy; marking sent advances the card (touch counter, 3-touch cap, congrats → beat 2 at +21d).
- **Pipeline panel**: open/closed-vs-pace/meetings; stage chips with counts; cards show value, tower, partner, with-partner days, **Zoho sync dot**; tap → action sheet (value, whale, stage select, Draft note, Packet → partner, Prep me, outcome grid).
- **Zoho linkage**: per-card `updatedAt`/`zohoSyncedAt`; header shows "⟳ Zoho · N to push"; **Push** exports the delta as an import CSV (+ leads file) and marks cards synced; every send BCCs the dropbox. Live two-way API sync remains Phase 2 item #1 (needs a backend).
- Suggested prompt chips adapt to state (due follow-ups, top markets by trigger count). Thread persists (kv-thread, last 80 messages).
- Preserved from the decision log: towers/partners routing, $ tiers, doctrine, DNC, KSA-via-UAE, AMS windows, radar markets, program clock.

## GROWTH ENGINE v2.0 — the rethink (2 Sep 2026): the market is the interface
**Diagnosis of "not intuitive":** concepts accreted faster than clarity — lanes, tiers, beats, heat, rooms, radar, packets; 5 tabs + 5 sub-tabs; up to 6 buttons per card. The operator had to learn the tool before reading the market.
**New mental model — Where → Who → What → Do**, organized by practice × geography × industry:
- **Insights (home):** three lenses — By practice (4 towers) · By geography (8 markets) · By industry (11 buckets via `industryOf`). Each cell card: live trigger count, fresh tier-1 count, new-logo count, tower pipeline-$ vs target, top sub-breakdown chips, and a synthesized **pattern → play → open first** (INSIGHT_SYS; auto-run daily for the 4 towers after the sweep, on-demand "Read the pattern" for geo/industry cells, cached in kv-insights). "Write a partner POV on this" drafts a LinkedIn post from the pattern. A "Today" strip surfaces follow-ups due and partners >3 days silent.
- **Targets:** one ranked, scannable row per company (score = tier + freshness + new-logo/client/watch weighting; AMS windows and fresh radar finds included), chips for practice / geography / industry + ⚡ fresh tier-1 and 🌍 new logos. Drilling from an Insights card pre-sets the filter.
- **Account page** (Room + queue card merged): WHY NOW (dated triggers, sources, two-beat flag) · THE PLAY (practice, tower, buyer, market line, proof; "Build the dossier" adds story/angles/warm path/channels via live search) · WHO (warm path, verified people, find-the-door, add person, official channels only) · DO (one primary: Draft the first/next note or Beat-1 congratulation; secondary: partner packet, log outcome, tag-without-drafting; inline value/whale; Not relevant / Not ICP).
- **Pipeline:** month-of-18 header with closed-vs-pace, pipeline, meetings, new logos; expandable revenue math (tower bars, day-90 bar, pipeline-$ by signal family, wedge→core); "With partners — awaiting update"; stage-sorted rows (due-now first); Won strip; Sync Zoho.
- **Ask:** unchanged loop, OPPS chips now open the Account page after tagging.
- **Settings** behind ⚙: partners per tower, operator & signature, Zoho, radar markets, program clock, do-not-contact.
- **Dropped for clarity:** Creatives studio, standalone POV Studio (now per-insight), Companies/People tabs (people live on the Account page), lane chips, heat scores in the UI, name-gate on first open. Storage keys unchanged; kv-insights added.
- Doctrine, dispatch, $ values, AMS resurfacing, DNC, KSA-via-UAE, Zoho ritual all preserved — relocated into the four-step flow.

## FINAL BUILD — Growth Engine v1.0 (built against the complete Decision Log)
- **Engine strip = Revenue Math:** M{n} of 18, live pipeline-$, closed-$ vs the curve pace (~$1.5M M6 / $6.5M M12 / $20M M18), Monday "Review day" chip, Zoho sync nag (Fridays + >6 days stale).
- **Queue:** 70/30 new-to-known interleave; lane chips (🌍 New market find / Watchlist / Expand-annuity / Follow-up); signals ranked tier × freshness; TAKE THEM reco with tower label on every card; warm-path line ("via {anchor} — ask for the introduction first"); DNC-filtered.
- **Doctrine in code:** two-beat CHRO play (L1/H5 ≤10 days → "Beat 1 — send the congratulation", zero-ask congrats mail kind, beat 2 auto-due at +21d); 3-touch counter per card with rotate-or-park flash; "Park 90 days" in What-happened; partner-sized asks + KSA-writes-from-UAE baked into MAIL_SYS; plain-text-first send flow.
- **Dispatch (single-operator mode):** tagging auto-routes tower → partner (Settings names); one-tap partner packet (trigger + tower + value + door + warm path + draft, plain text for mail/WhatsApp); "With partners — awaiting update" section with day-counters (red >3d) and re-send.
- **$ everywhere:** editable value per card, tier defaults wedge $75K / core $300K / whale $500K; whale ⭐ toggle; wedge→core conversion auto-logged when value crosses $250K; Zoho deals CSV carries Amount + tower + partner.
- **Revenue tab:** curve pacing card, tower bars vs targets (T2 $6M · T3 $5M · T4 $5M · T1 $4M), day-90 checklist (≤M3), pipeline-$ by signal family (kill-or-boost), Zoho sync card.
- **AMS motion:** capability sweep hunts Darwinbox/HCM go-lives 6–18 months back; L6 log entries aged 180–540d resurface as T2 AMS queue cards.
- **Radar:** 5 daily markets (India/UAE/KSA/PH/MY, editable), raised ICP (2,000+ employees or $100M+, scaling exception), TH+QA benched everywhere.
- **Rooms:** story / warm path / posture / angles / channels ("fastest ways in" — official page + published generic mailboxes only, ✉ Use pre-fills the draft) / thread / people / next move — every section ends in a DO-THIS.
- **POV Studio (More):** weekly LinkedIn POV per partner, tower + market picked, anchored on the freshest matching live trigger, drafted in the partner's voice.
- **Compliance:** shared kv-dnc do-not-contact list enforced in queue, tagging, and MailBox; stakeholder rules and channel rules hard-coded in every prompt.
- Storage keys: kv-intel, kv-signal-log, kv-stakeholders, kv-pipeline, kv-settings (partners, programStart, lastZohoSync, zohoBcc, sender), kv-universe-extra, kv-rooms, kv-dnc, kv-me (private: name, radar), kv-activity (private).

## v13 — Market-first: radar beyond the watchlist, research bench, official channels
Answers "most accounts are current accounts": the watchlist becomes the warm subset of a scanned market.
- **Why it was happening (diagnosis):** seed universe anchored on clients/lookalikes; Heat's fit term (client 25 vs discovered 10) biased every heat-sorted surface; discovery was 1/7 sweeps entering at the bottom. Fixed at all three layers.
- **Market Radar:** per-market radar sweeps (`makeRadar`) with NO priority list attached — hunts the whole market against an editable **ICP** block (1,000+ employees or visibly scaling; founder-led high-growth in scope regardless of size; ministries/shells excluded). Default daily markets India · UAE · KSA · PH, user-editable in Settings (kv-me.radar), appended to the seven standard sweeps.
- **60/40 lanes:** `buildQueue` rebuilt — signals rank on tier × freshness (heat de-biased); plays classified into lanes (new = radar finds/unknown names, watch = seed prospects, expand = clients, follow/housekeeping) and dealt 3-new-then-2-known so the market structurally outweighs the watchlist. Lane chips on every card (🌍 New market find / Watchlist / Client — expand).
- **Research bench** (new tab, badge = awaiting count): radar finds land here for the researchers working alongside — each card shows why it surfaced, the TAKE THEM reco, and four actions: Verify in the room · Find the door · **⚑ Convert to active lead** (enters Flow with practice attached) · ✕ Not ICP (drops it). Loop stated on-card: read source → room → door → convert.
- **Official channels ("act fast"):** ROOM_SYS now returns `channels` — the official contact/careers page and up to 3 GENERIC corporate mailboxes (info@/hr@/careers@) the company itself publishes. Hard rules in-prompt and in-parse: never individual emails, never pattern-guessing. Room renders "Fastest ways in" with Copy and ✉ Use (drafts with the address pre-filled via MailBox `to`). Compliance stance: corporate channels yes, personal data no (DPDP/PDPA + deliverability).
- **New-logo scoreboard:** engine strip adds "🌍 N new logos this wk" (tags on non-seed accounts count via activity type `newlogo`).

## v12 — Market-wise engine with up-front solution recos
The engine gains a market lens and leads every card with the solution to take there.
- **Market lens:** chip row (All · India · PH · MY · ID · VN · TH · SG · UAE · KSA · QA) filters the queue by account country. Selection is per-session.
- **Market Pulse** (dark card, shown when a market is selected — zero API cost, curated `MKT` playbooks): the market's demand headline, 2-3 drivers in plain lines (e.g. India: GCC boom / internal-mobility retention / skills-first ahead of mapping; UAE: Emiratization deadlines; KSA: Nitaqat + giga-projects), live counts (fresh signals · warm accounts · untouched here), and **WHAT TO TAKE HERE** — the ranked solutions for that market, each with a market-tailored one-liner and a **Find takers** button that sends the copilot hunting live targets for that practice in that market (answers come back as taggable OPPS chips).
- **Up-front solution reco on every card:** `recommendFor(account, signals)` — signal present → its practice with the market-tailored pitch line; no signal → the market playbook's pick matched to the account's engine; fallback → segment-keyword mapping. Rendered as a **TAKE THEM → {practice}** panel on signal cards and untouched-account cards; tagging carries that practice onto the opportunity (no more TBD tags from the queue).
- Playbook content is deterministic and editable in one `MKT` block at the top of the file — regional teams can tune their own pitch lines without touching logic.

## v11 — The Opportunity Engine: never-empty queue, tag-everywhere, flow pipeline
Fresh interface built as an automation engine. Three laws: the queue is never empty; everything tags into the pipeline in one tap with the SPOC as owner; the pipeline reads as a flow.
- **Engine strip (dark header):** live status (● Live watching ten markets / ● Scanning…), today's throughput counters (found · tagged · sent), streak. The engine always shows it is working.
- **Never-empty queue** (`buildQueue`, all local/deterministic, priority order): overdue follow-ups → fresh signals (tier, then hidden heat) → warm untouched accounts (heat ≥40, no active card — "Warm & untouched — Tag it to me") → stale rooms on hot accounts (room `at` older than 7 days — "↻ Refresh the room") → opportunities with no verified person ("No named door — Find the door") → prospecting fallback from top-heat untouched accounts whenever the queue would drop under 5. An empty Today can no longer happen — a quiet wire yields tag/open/intel/door work instead.
- **Tagging is the one verb:** `tagOpportunity({account, practice, signal, evidence…})` — creates the card owner=SPOC, logs the signal, absorbs unknown companies into the universe as SPOC-tagged, reuses an existing open card instead of duplicating. Queue signal cards: "⚑ Tag & draft the mail" (tag + inline MailBox in one motion, auto-stacking the room's sharpest angle when a room exists).
- **Ask returns taggable opportunities:** `SYS` gained an OPPS_JSON protocol — when an answer contains concrete opportunities the copilot appends a machine line; the interface strips it, renders "Tag into your flow" chips with ⚑ Tag buttons under the answer. When the SPOC asks, opportunities tag directly.
- **Flow view** (replaces My deals): every opportunity shows FlowDots (Tagged → Contacted → Talking → Meeting → Proposal, won=green trail), plain status words renamed (Plan reach-out→"Tagged", Reached out→"Contacted"…, storage stage values unchanged for Zoho mapping), Mine/Everyone's filter, What happened? buttons, Next mail with room-angle stacking.
- **MailBox** unified drafting component (queue, flow, room) — plain-text primary, branded secondary, ANGLE-aware. Rooms carried over from v10 unchanged (reco per section). Same storage keys; all prior data flows in.

## v10 — Account Rooms: intelligence that compounds, reco on every section
The atomic unit shifts from signal → **account**. Each account gets a Room — a living dossier — with a hard design rule (user's requirement): **every section ends in an AI recommendation with a one-tap action**, so intelligence is never homework.
- **Room sections + their recos:** Story (what they're visibly trying to do; reco = posture: which practice to lead with now → "Write the opener") · Sharpest Angles, 2-3 (each links a fact about them to one of our proofs; per-angle "Write with this" — angle-stacked drafting, per evidence that stacked signals roughly double replies) · Moments (cumulative timeline from wire + log; per-moment "Use" in a mail) · People (verified directory for this account; reco = which role to verify next → "Find them for me" via copilot) · Thread (where things stand; reco = next_move → "Write that mail").
- **Engine:** `ROOM_SYS` (search-enabled, JSON: story/posture/angles/people_reco/next_move; stakeholder rules enforced) via `callRoomWriter`. Cached shared in `kv-rooms` keyed by account with `at` date — one call per account, team-wide reuse; Refresh re-spends deliberately. Rooms open from: a play card ("Open the room"), any deal row (account name), or Companies ("Open room").
- **Angle-stacked mails:** `MAIL_SYS` now honors an ANGLE line; Room "Write with…" ensures a deal card exists (`ensureCard` reuses open card or quietly creates one), then drafts around the chosen angle.
- **Plain-text correction (evidence-led):** first touches copy as plain text (reads one-to-one, which is what gets replies); branded HTML demoted to secondary "Copy branded" on follow-ups — its home is marketing assets, not cold outreach.
- Deferred to next iterations: Clusters (pattern → POV asset → segment plays for marketing), learning loop (reply-rates per angle/signal reordering the deck), Phase 2 push nudges.

## v9 — The intuitive rethink: one play at a time
Design law: **complexity in the engine, one thing at a time on screen.** All machinery (signal IDs, tiers, decay windows, Heat Score, pipeline stages, XP) still runs — none of it is visible. The interface speaks only plain sentences.
- **The deck:** the engine's single output is an ordered stack of "plays" — overdue follow-ups first, then fresh signals ranked by (hidden) heat and tier. One big card at a time: who · why now ("JSW Group just appointed a new CHRO 3 days ago.") · why us ("That usually means… Good news: we…") · "You have a door: {verified person}" · one primary button: **Show me the mail**. Actions: Later today / Tell me more (→ Ask) / Not for us.
- **Plain-language dictionary** (engine → screen): H1 Tier-1 → "announced a big hiring number"; decay ≤7d → "Fresh news — this week is the window"; heat ≥70 → "🔥 Very warm"; stage Reached out → "Waiting to hear back"; overdue → "Time to follow up".
- **What happened?** replaces stage dropdowns: six human buttons (They replied / Meeting booked / Sent a proposal / Still quiet / We won / It's dead) map internally to the same STAGES + next-step + due logic.
- **One action does everything:** "Looks good — open in my mail app" sends (BCC→Zoho), creates/advances the deal, logs the signal, awards XP (incl. silent beat-the-decay bonus), sets the follow-up, deals the next card.
- **Chief-of-staff brief** (BRIEF_SYS rewritten): 2–3 second-person sentences, no scores, no jargon. Gamification surfaced as one human line ("3 plays done today — good pace") + streak; XP accrues silently (visible only in Settings).
- Views: **Today** (deck) · **My deals** (plain-status list) · **Ask** · **More** (Companies / People / Creatives / Settings incl. Zoho). Same storage keys throughout — v9 reads all prior data. Manual signal-log UI retired from the surface (log still written by plays).

## v8 — The intelligence workbench (design-philosophy shift)
From "website containing intelligence" to "intelligence as the surface":
- **Analyst Brief:** after each sweep, a synthesis call (`BRIEF_SYS`, no web tool — pure synthesis of findings + overdue follow-ups + heat board) writes a 4–6 sentence 07:00 analyst note with three numbered priorities. Cached in `kv-intel.brief {text, priorities, at}`. Regenerable on demand. Uses only facts present in the input — never invents.
- **Pattern Watch:** local (zero-API) detection connecting live signals into themes × regions — SUCCESSION (L4/L15/L8/L3b), HIRING SURGE (H1/H2/H3/H4/H11), CAPABILITY BUILD (L2/L6/L7/L13), NATIONALIZATION (H7/L11), DEAL FLOW (L3/L10); shown when ≥2 signals cluster (e.g. "3× SUCCESSION · Gulf").
- **Live Wire:** feed rendered as a dense wire — tier glyphs (● ▲ ·), mono timestamps, T-minus decay counters, per-row WHY IT MATTERS (practice pain language) and NEXT ▸ action lines.
- **Workbench chrome:** dark terminal surface, ops status line (◉ LIVE / ◉ SENSING, accounts count, sweep time, operator level/XP/streak), persistent command line (❯) that routes to the copilot, modes BRIEF / DESK / ASK / BASE. Operator panel with mono progress bars replaces rings; heat board and quests in the right rail.
- Everything from v4–v7 retained: live universe + discovery absorption, Heat Score, XP/streaks/quests, stage-aware inline composer, Zoho bridges, creatives (Base ▸ Creatives), same storage keys. Cost note: the brief adds one synthesis API call per sweep (and per manual REBRIEF).

## v7 — Inline intelligent exchange + expanded regions
- **Mail Studio dissolved into the pipeline.** No separate tab: every pipeline card carries an inline composer. Opening it auto-drafts from full context (account, signal, evidence, stage, verified stakeholder from the directory, sender settings). "✉ Mail now" on any signal = add-to-pipeline + log + draft in one tap.
- **Stage-aware MAIL KINDs** (in `MAIL_SYS`): Plan reach-out → *first-touch* (four blocks, <130w) · Reached out → *follow-up* (<80w, one new angle) · In conversation → *value-add* (<80w, no ask) · Meeting set → *meeting-confirm* (<70w, 3-point agenda) · Proposal → *proposal-nudge* (<80w, de-risking step). Sending advances the stage and books the follow-up (+5d).
- **Regions expanded:** universe, sweeps, and discovery now span India, Philippines, Malaysia, Indonesia, Vietnam, Thailand, Singapore, UAE, Saudi Arabia, Qatar. H7 broadened to all nationalization regimes (Emiratization/Nafis, Saudization/Nitaqat). Gulf sweep covers Vision 2030 giga-projects (NEOM, Red Sea, Diriyah). Note: this supersedes the playbook v1.1 recommendation to bench KSA — entity/localization requirements for Saudi engagements still need a commercial decision before first outreach.
- Creatives moved to Base → Creatives.

## Heat Score (v6 account-priority model)
`Heat (0–100) = Fit (0–25) + Intent (0–35) + Engagement (0–25) + Coverage (0–15)`
- **Fit:** Client-expand 25 · seeded prospect 18 · auto-discovered 10 (until human review upgrades it).
- **Intent:** each live Tier-1 signal contributes 14, Tier-2 contributes 7, multiplied by remaining-decay fraction (linear); capped at 35. Tier-3 excluded.
- **Engagement:** best active pipeline stage — Plan 4 / Reached 8 / In-conversation 14 / Meeting 20 / Proposal 25; −5 stall penalty when a follow-up is >7 days overdue.
- **Coverage:** +5 per verified stakeholder at the account, capped 15 (buying-committee proxy; Gartner: 6–13 members).
- Tiers: 🔥 HOT ≥70 · WARM 40–69 · WATCH <40. Rationale: standard Fit×Intent×Engagement triad + buying-group coverage; intent weighted highest because the engine is signal-led. Excel workbook formula remains the audited scoring of record; Heat is the daily operating view.

## Gamification (v6)
XP: mail 10 · pipeline add 15 · meeting 50 · won 100 · verified person 5 · +10 "beat the decay" bonus for acting on Tier-1 within 7 days of the signal. Levels: Signal Scout 0 → Pipeline Builder 100 → Deal Shaper 300 → Closer 700 → Rainmaker 1500 → Market Maker 3000. Streaks = consecutive active days. Three weekly quests (fast strikes, stakeholder coverage, zero overdue). Deliberate exclusions per research: no person-vs-person leaderboard (accounts ranked by Heat instead), XP weighted to quality actions over volume, revenue outcomes not gamified.

`Finding` = `{account, signal, tier, headline, evidence, url, date, confidence, action, sweep}`; key = `account|signal|date`. Account names must match the universe exactly (dropdown-enforced in log; sweep prompts carry the list).

---

## 4 · PROMPT LIBRARY (canonical copies live in the .jsx)

- **SYS** — copilot system prompt: full practice catalog (generated from `PRACTICES`), 27 signal IDs, 360-brief structure, four-block outreach rules, strict stakeholder rules (roles only; decline contact-detail requests), HAC framing, "DRAFT — human review required."
- **SWEEP_SYS** — sweep engine: JSON-only schema, signal ID definitions, 30-day recency rule, max 6 items, no personal data.
- **SWEEPS[7]** — batch prompts: leaders · hiring/expansion · GCCs · conglomerate M&A/demerger/family · academies/HCM/skills/AI · CXO exits (succession) · UAE/Gulf. Each embeds the relevant universe slice for name matching.

Tuning loop: weekly, review `dismissed` vs `logged` per sweep batch; rewrite the noisiest batch's prompt. The dismissal data is the training signal.

---

## 5 · PHASE 2 — THE SCHEDULED JOB (removes the last manual step)

A small server job (any runtime; ~100 lines) that makes intelligence arrive with nobody's browser open:

```
06:30 IST daily:
  for sweep in SWEEPS:                      # same 7 prompts, verbatim
    call /v1/messages  model=claude-haiku-4-5-20251001
         system=SWEEP_SYS  tools=[web_search]  max_tokens≈1200
    parse JSON, dedupe against yesterday (key = account|signal|date)
  write items -> store the app reads (or push into kv-intel via a sync)
  render digest (tier-1 first, practice tags) -> Slack channel + email
  weekly: append log-vs-dismissed stats -> prompt-tuning report (Sonnet)
  monthly: top-10 accounts by score -> deep dossier per account (Opus 4.8:
           full signal history + fresh search + practice fit + relationship map)
```

Secrets: server-side API key only (never in the artifact). Add per-account owner mapping so the digest @mentions the owner of each finding. CRM sync (HubSpot free tier first) replaces the workbook mirror when ready.

---

## 6 · GOVERNANCE (non-negotiables, enforced in prompts and UI)

1. **People data:** name, title, company, public source, verification date. Nothing else — no emails, phones, addresses, personal details — anywhere in prompts, storage, or outputs. DPDP/PDPA applies to this pipeline.
2. **HAC:** AI detects and drafts; a human confirms every log entry and reviews every message before sending. Findings are labeled with confidence; drafts are labeled DRAFT.
3. **Verify before acting:** every finding carries a source URL; the salesperson opens it before outreach. Role-holders re-verified before any first touch.
4. **Named-client references:** which proof points may be named to which audiences is a human decision — the copilot uses only the marquee list it was given.

---

## 7 · BACKLOG (in priority order)

1. Phase 2 scheduled job + Slack/email digest (§5) — the true "automatic."
2. Per-salesperson account ownership + "My accounts" feed filter.
3. Zoho CRM full API sync (OAuth, two-way deals/contacts) — the v4 bridges already shipped: BCC-to-dropbox auto-logging of every sent mail, and one-click Zoho-format Deals/Leads CSV exports.
4. Dismissal-driven sweep-prompt tuning report (weekly, automated).
5. KSA toggle: 8th sweep batch (Tadawul, Saudization, PIF portfolio, giga-projects) behind a flag — pending the strategy decision.
6. Psycholinguistic stakeholder profiling module (public language → communication-style brief per stakeholder, human-reviewed) — the dogfooding differentiator from Playbook §7.
7. Score parity: bring wallet × access into the app so the workbook can eventually retire.

---

*Hand this document + the .jsx + the Playbook to any capable model or developer and the build continues without this chat. That independence is the point.*
