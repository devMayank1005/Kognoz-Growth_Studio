@AGENTS.md

# Growth Studio

Partner-led sales intelligence console for Kognoz / Konverz. Chat-first: ask a question →
streamed answer → action table → `＋ Add` → routed pipeline card → Zoho.

**The PRD in `docs/Growth_Studio_PRD.md` is the contract.** `docs/konverz-sales-copilot.jsx` is
the reference prototype — behaviour, prompts, and routing logic come from there. When they
disagree, the PRD wins on scope and the prototype wins on behaviour.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · Motion
Neon Postgres · Drizzle · Better Auth · Inngest · Anthropic SDK
Zustand · Zod · Vitest · Playwright

**TanStack Query and Table were removed** (2026-09-03): nothing called `useQuery`/`useMutation` and
Table was never imported, so both shipped on every route doing nothing. Every page loads its data in
a server component. Either can return in one line when something actually needs client-side caching.
shadcn/ui is not installed either — there is no `src/components/ui/`, no radix; the UI is hand-rolled.

## Next.js 16 gotchas (this is not Next 14/15)

- `cookies()`, `headers()`, `draftMode()` are **async** — always `await` them.
- `params` and `searchParams` are **Promises** in `page.tsx`, `layout.tsx`, `route.ts`.
- Use the generated helpers: `PageProps<'/path'>`, `LayoutProps<'/path'>`, `RouteContext<'/path'>`.
  Regenerate with `pnpm exec next typegen`.
- **`middleware.ts` does not exist here — it is `proxy.ts`**, exporting `export function proxy(request)`.
  Node runtime only; `edge` is not supported in `proxy`.
- Turbopack is the default bundler.
- **Theme toggle trap:** setting `data-theme` on `<html>` from client JS after
  hydration causes a React hydration mismatch (verified in-session). When the
  Late Shift toggle is built, set it from a small blocking inline script in
  `<head>` that runs before React hydrates — not from an effect.
- Port 3000 is usually taken by the separate Kognoz Social Studio app on this
  machine, so `pnpm dev` typically lands on 3001. Check the startup log.

## Git

Commit as the repo's own configured identity — **devMayank1005 <devmayank1005@gmail.com>**. Never
pass `-c user.email=...` to override it.

Do **not** add `Co-Authored-By:` trailers. This project deploys from Vercel on the **Hobby** plan,
which does not allow collaborators on a private repo: a commit whose author or co-author is not the
project owner is refused with *"the commit author did not have contributing access"*. Twenty commits
were rewritten once already for exactly this.

Commit messages here are load-bearing, and one is not: **`efa3b11`, messaged "Refactor code
structure for improved readability and maintainability", is actually the USD→INR re-denomination**,
migrations `0011` and `0012` included. Anyone bisecting money behaviour will otherwise skip it.

## Environment variables

**Read every env var through `src/lib/env.ts` (`readEnv` / `requireEnv`), never `process.env`
directly.** An eslint rule enforces this under `src/` (with `env.ts`, tests, and `NODE_ENV` exempt).

A trailing newline on `MICROSOFT_TENANT_ID` in Vercel cost hours: Better Auth builds
`${authority}/${tenant}/oauth2/v2.0/token`, so the request went to `.../{tenant}%0A/oauth2/v2.0/token`
and Microsoft refused the URL before Entra ever saw it. It surfaced only as a sign-in redirect loop —
the authorize leg builds a `URL`, and the WHATWG parser strips control characters, so that half
worked perfectly. `readEnv` strips whitespace and its percent-encoded forms (`%0A`, `%0D`, `%09`) at
the ends only, and warns once per variable so the value still gets fixed at source.

**Credentials use `readSecret`, which keeps only the first line.** A paste into Vercel once carried
`ANTHROPIC_API_KEY` *plus a blank line plus the `# ---- Better Auth ----` header* out of `.env`, so
the SDK threw `Headers.append: … is an invalid header value` and every model call failed for hours —
surfacing only as "the draft could not be written, try again". `readEnv` cannot catch that: the junk
was a comment, not whitespace. Cutting at the newline is not a guess — a value used as an HTTP header
cannot legally contain one.

Applied to `ANTHROPIC_API_KEY`, `MICROSOFT_CLIENT_SECRET`, and both Inngest keys.
**`BETTER_AUTH_SECRET` is deliberately left raw**: it is an HMAC key that never crosses a header
boundary, so junk in it is harmless as long as it stays consistent — sanitizing it would change the
signing key and sign every user out.

`src/engine/client.ts` exports `engineConfigError`, checked by the chat route and `generateDraft` so
a misconfigured key is reported as configuration rather than inviting a retry that cannot work.
`zohoConfigError` and `cryptoConfigError` follow the same pattern — **`console.error` plus an
exported string, never a throw.** A misconfigured optional integration must not take down pages
that never touch it.

**Zoho.** `ZOHO_CLIENT_SECRET` uses `readSecret`, `ZOHO_CLIENT_ID` uses `readEnv`. Strictly a
newline is legal in a form-encoded POST body, but a URL-encoded newline in `client_secret`
produces Zoho's opaque `invalid_client` with nothing pointing at why — the same incident class
this file already records twice. `zohoConfigError` additionally checks the client id starts with
`1000.`, because the likeliest paste error is putting the secret in the id slot and the result is
an opaque failure at the consent screen.

**`ZOHO_TOKEN_KEY` must decode to exactly 32 bytes** (`openssl rand -base64 32`). Unlike
`BETTER_AUTH_SECRET`, a wrong value here does not fail as a config error — it fails as a GCM
auth-tag mismatch, which reads exactly like data corruption. The envelope carries an 8-hex-char
**fingerprint of the key, not the key**, so a failure can say "encrypted under `a3f21c8b`, this
server holds `9d40e117`" instead of "decryption failed". `ZOHO_TOKEN_KEY_PREVIOUS` is
decrypt-only, for rotation.

## Deployment

Production: **https://kognoz-growthstudio.vercel.app** (Vercel). Runbook: `docs/DEPLOY.md`.

- `BETTER_AUTH_URL` must be the production URL, and the Entra app must register the full callback
  path `.../api/auth/callback/microsoft`, not the site root.
- `ANTHROPIC_API_KEY` is read implicitly by the SDK, so it never shows up in a `process.env` search
  — easy to omit from an env checklist.
- Inngest needs the app **synced**, not just the keys. Fastest way, no dashboard:
  `curl -X PUT https://kognoz-growthstudio.vercel.app/api/inngest` — the app registers itself, and
  because it authenticates with its own signing key, success also proves that key is correct.
  To verify from outside, sign a GET with `signDataWithKey` from `inngest/helpers/net` and look for
  `authentication_succeeded: true` (see `docs/DEPLOY.md`). Locally it needs no account at all:
  `npx inngest-cli dev`.
- **Zoho matches `redirect_uri` byte for byte**, and it is built in exactly one place
  (`zohoRedirectUri()` in `src/lib/zoho/config.ts`) so the authorize leg and the token exchange
  cannot drift. Register `https://kognoz-growthstudio.vercel.app/api/zoho/callback` plus
  `http://localhost:3000` and `:3001` — dev usually lands on 3001.
- **Vercel preview deployments cannot connect Zoho**: their URLs change per deploy, so no
  registered redirect URI can match.
- Register the Zoho app as a **server-based application under an org-owned account**, never a
  Self Client and never an individual's login. A Self Client's grant is welded to whoever is
  signed in to the API Console, and a closed personal account kills the client and every refresh
  token it ever issued.

## Database

Neon, **claimed and owned** (project `wispy-tree-92088623`, region `us-east-2`). Runbook and the
region-move plan: `docs/CLAIM-NEON.md`.

- The app uses the **pooled** `DATABASE_URL`. Migrations and `pg_dump` use the **direct**
  `DATABASE_URL_UNPOOLED` — Neon's pooler does not carry the session state they need.
- **After any credential rotation, `neon env pull` updates `DATABASE_URL` but NOT
  `DATABASE_URL_UNPOOLED`.** That one is ours; derive it by removing `-pooler` from the new host.
  This has already caused one round of `password authentication failed`.
- `pnpm db:backup --verify` dumps and then proves it by restoring into a local scratch database.
  Dumps land in `backups/`, gitignored because they contain real email addresses (§8).

**Migrations since 0004:** `0005` `zoho_connections` · `0006`/`0007` currency and FX columns on
`settings` · `0008` `sweep_runs.dropped` + `web_search_degraded` (a *refused finding* is not a
*failed run*; conflating them kept the status strip red all day after one transient 05:36
failure) · `0009` `zoho_dry_run` · `0010` the four `opportunities.zoho_*` sync-state columns ·
`0011`/`0012` the re-denomination · `0013` the `activity_log` view · `0014` a one-off account
merge · `0015` CHECK constraints for every text-enum column · `0016` the three unique indexes the
select-then-insert paths assumed they had, plus the de-duplication they needed first · `0017`
`zoho_push_attempts`, the intent log that stops a retry creating a second Lead · `0018` RLS policies
and the `growth_app` role (created and tested, **not** enforcing — see `src/db/client.ts`) · `0019`
numeric range constraints, written as `BETWEEN` because `enum-checks.test.ts` parses the `IN` form ·
`0020` `activities` foreign keys to `SET NULL` so the audit trail outlives what it describes ·
`0021` `created_at` on `signals` and `people`, backfilled in three steps so the history survives ·
`0022` `activities(account_id, at desc)`.
`0013`+ are hand-written; `drizzle-kit generate --custom` writes the journal entry.

**`activity_log` is a view for reading the audit trail in the Neon console**, not for the app —
nothing in `src/` queries it. It resolves `actor_id` to a name and unwraps
`payload_json.action`, because `activities.type` is a catch-all: stage moves, DNC edits and the
re-denomination all store `type = 'note'` and hide the real verb in the payload. **No column in
it may be named email/phone/etc.** — `check-compliance` scans `information_schema.columns`, which
includes views.

## Money

**Everything is rupees. Do not convert it again.** `PROGRAM_TARGET = 2_000_000_000` (₹200Cr),
`TIER_VALUE {wedge 7.5M, core 30M, whale 50M}`, `CORE_FLOOR 25M`, `WHALE_FLOOR 50M`,
`VALUE_CAP 10_000_000_000`.

- The re-denomination happened **once**, at a **frozen ₹100** planning rate — not a market print.
  It is recorded as the exported `REDENOMINATION` constant in `src/domain/revenue.ts` so anyone
  about to "fix" one of the numbers greps for it and lands there first.
- **Never wire those constants to `settings.fx_usd_inr`.** They are literals on purpose. A
  constant derived from a live rate turns a fixed commitment into one that moves with the market
  — and `tier`/`whale` are *stored* columns, so the stored value would then disagree with the
  derived one and live cards would silently re-tier.
- `0011` moved amounts, tiers and both currency settings in one transaction; `0012` moved the
  amounts buried in `conversations.messages_json`. `0011` alone was not enough: action-table rows
  inside old conversations each render a live `＋ Add` button, so a stale row is a button that
  creates a card at 1/100th of its worth. `0012` touches **only `rows[].value`** —
  `chart.data[].value` in the same documents counts triggers per market, and multiplying counts
  turns a bar chart into nonsense.
- **`convertAmount` refuses rather than falls back.** No rate, or one older than
  `MAX_RATE_AGE_DAYS = 3`, returns `{ok:false}` — never the unconverted number. A card that fails
  to sync is a visible problem; a deal sitting in the client's CRM at 1/83rd of its value is
  invisible until someone builds a board pack out of it. Rates are integers scaled by
  `RATE_SCALE = 10_000`.
- `constantsMatch` fails writes closed when `settings.base_currency` disagrees with
  `CONSTANTS_CURRENCY`. **Trap:** the schema default for `base_currency` is still `'USD'` and
  `0011` only `UPDATE`s existing rows, so a fresh `pnpm db:seed` after migrating writes a row
  saying USD and every add is then refused with `MIGRATION_IN_PROGRESS`. The guard is correct —
  fix the seeded row, do not weaken the guard.
- The FX rate is one keyless fetch folded into the morning sweep, not its own cron. A failed
  fetch is not an error state: the previous rate stays and its *age* is the signal. A manual rate
  sets `fxManualOverride`, which makes the nightly fetch skip — remove that and the override is
  meaningless. Both the fetcher and manual entry carry a 1–1000 sanity band, because a
  fat-fingered `8321` for `83.21` understates every deal by 100× and looks plausible.
- `src/domain/money.ts` and `src/lib/fx.ts` still *open* with "Growth Studio stores USD". That
  prose predates the re-denomination and is stale; the code is correct.

## Zoho — the connection

- **A token is not portable across data centres.** One issued at `.in` returns **401** at
  `.com`'s API domain with nothing saying why, so the region is part of the connection, stored
  per row. There is deliberately **no API domain** in the DC table (`src/domain/zoho/dc.ts`):
  Canada's accounts host is `accounts.zohocloud.ca`, which proves the pattern is not derivable.
  The API domain is only ever what Zoho returned in the token response.
- Host checks are exact-or-dot-suffix. An earlier `/zohoapis\.[a-z.]+$/` accepted
  `zohoapis.in.evil.com` — which would have sent the access token to somebody else's server.
- **Zoho returns HTTP 401 with `OAUTH_SCOPE_MISMATCH` for a missing scope, not 403.** Branch on
  the **code first, status second**. Backwards, a scope problem reads as a wrong data centre and
  sends whoever is debugging it into region settings for an afternoon. Verified against the live API.
- **An access token lasts 1 hour and only 10 token requests are allowed per 10 minutes.** That is
  why the token is cached on the connection row, why the refresh takes `SELECT … FOR UPDATE` with
  the expiry **re-read inside the lock**, and why `pushCard` mints a token *after* the dry-run
  branch — a dry run makes no network call at all.
- `access_type=offline` **and** `prompt=consent` are both mandatory on the authorize URL. Without
  them a second authorisation returns no refresh token, the connection succeeds, and dies in
  exactly one hour. The callback refuses to store a grant with no refresh token.
- The OAuth `state` cookie is `SameSite=Lax`, not Strict — Strict drops it on Zoho's cross-site
  top-level GET back, so validation would fail on *every* connect and look like Zoho rejecting
  us. It is base64url because Zoho mishandles a `|` in `state`, encoded or not.
- `/api/zoho/connect` and `/api/zoho/callback` are deliberately **not** matched by `proxy.ts`: a
  redirect to `/sign-in` there discards a short-lived authorization code. Auth is enforced inside
  the handlers, where the failure can be named.
- The refresh token is AES-256-GCM at rest, AAD-bound to `zoho:refresh:{orgId}` — which matters
  precisely because org isolation here is a `where` clause and nothing else. **`src/db/zoho.ts`
  is the only module that may select the encrypted columns**; everything else goes through
  `loadZohoStatus`. A decrypt failure is reported as `unreadable`, **never as "not connected"** —
  the latter sends the operator to reconnect, which burns one of Zoho's 20 refresh tokens per
  user and does not fix a mismatched `ZOHO_TOKEN_KEY`.

## Zoho — what gets written

- **`settings.zoho_dry_run` defaults to `true`.** A dry run builds the full payload and returns
  before any network call. Nothing has necessarily ever been written to a live CRM.
- **`src/lib/zoho/records.ts` is the only module that speaks HTTP to the CRM, and it has no
  delete function — deliberately.** A bug cannot call what does not exist. Same structural
  argument as `people` having no email column. (This is convention; what eslint enforces is
  domain purity — see `## Layout`.)
- **Zoho returns HTTP 200 with a per-record failure inside `data[]`.** A record refused for an
  unknown picklist value is not a 4xx. Check the per-record verdict, or you store an id that does
  not exist. Same shape as the web-search rule below — read the body, not the status.
- **Never echo a Zoho error body.** An `INVALID_DATA` response repeats the record back, and for a
  Contact that echo contains `Email` and `Phone`. Keep `message` only. §8 applies to diagnostics.
- **Resolve the CRM's currency through `currencyCodeOf`, never a literal comparison.** `/org`
  returns four spellings of the same fact; a connection holding `"Indian Rupee"` failed a
  `=== "INR"` check, fell back to base, and shipped every Deal unconverted — off by 83×. An
  unknown currency returns `null` and the card is blocked, never guessed.
- `pushAction` is derived from the row every time, never stored, so a retry recomputes rather
  than trusting a flag that may not have been written. `updateRecord` ids come only from our own
  `zoho_lead_id`/`zoho_deal_id` columns — never a search, never a name match.
- **`queueZohoPush` never throws and is called only after the transaction commits.** A queue
  outage must not fail the operator's mutation; a worker reading before the commit sees the old
  row. It takes the **inserted row id** — passing `makeCard`'s own generated id made every add
  silently skip its sync, invisibly, because dry-run and "card not found" both write nothing.
- **The pull leg is built, tested and not wired.** `parsePulledDeal`, `stageFromZoho` and
  `conflict.resolve` have no non-test callers and there is no reconcile job, so PRD §6 /
  acceptance #6 (two-way sync within the hour) is **not met**. If you wire it: the reverse stage
  map is lossy (three local stages all push as `Qualification`), so ask the forward map first or
  every `Plan reach-out` card drags forward on the first reconcile, forever.

## Anthropic API rules (do not regress these)

- Model is **`claude-opus-5`**. The PRD's `claude-sonnet-4-6` is a stale ID — do not copy it from
  the prototype. Extraction runs on `claude-haiku-4-5`.
- Web search tool is **`web_search_20260209`**, not the prototype's `web_search_20250305`.
- **Never** send `budget_tokens` or `temperature` — both return 400 on Opus 5.
- **Fast Mode is NOT enabled on this org** (verified 2026-09-02: "rate limit of 0 fast mode input
  tokens per minute"). The engine runs standard Opus 5. The capability stays behind
  `ENABLE_FAST_MODE=1`, off by default — do not make it the default path, it will always 429.
  If it is ever granted, it needs all three together: `client.beta.messages.stream(...)`,
  `betas: ["fast-mode-2026-02-01"]`, and top-level `speed: "fast"`.
- Web search errors return **HTTP 200** with an error object inside `web_search_tool_result` —
  they do not throw. Success `content` is an array; error `content` is an object. Branch on it.
- Build the cached live-state block against a **5-minute rounded timestamp**, never `Date.now()`,
  or the prompt cache never hits. Verify with `usage.cache_read_input_tokens`.
- The API key is server-side only. Never prefix it `NEXT_PUBLIC_`.
- `ENGINE_SYS` interpolates `formatCompact(PROGRAM_TARGET, "INR")`. It is still built once at
  module load from deterministic sources, so caching holds — but a change to `formatCompact` or
  `PROGRAM_TARGET` invalidates the cached prefix. Everything volatile still belongs in the
  live-state block, which now also carries a `CURRENCY:` line naming the **effective** currency
  (`effectiveCurrency`, i.e. the fallback), never the requested one — or rupee figures get
  labelled as dollars in the one block the model trusts.
- `engineRowSchema.value` has a plausibility floor of `TIER_VALUE.wedge`, not `positive()`. The
  floor exists precisely so legacy dollar magnitudes (75000, 300000) are *rejected*; `makeCard`
  then defaults to `TIER_VALUE.core` rather than storing something wrong.

## Hard product rules (PRD §8 — compliance, not preferences)

- **No personal contact data anywhere.** `people` carries name, title, company, date, public
  source only. No email, phone, address, or personal social columns — not in the schema, not in a
  form, not in a prompt, not searched for. Company-published generic mailboxes only; never guessed.
- **DNC blocks add, draft, and packet** — every path, enforced in the domain layer.
- **Most mutations write an audit entry, and the ones that do write it in the same transaction.**
  Not "every" — that was claimed here and was not true. What is audited: every card write
  (`card-actions.ts`), every add, the DNC list both directions, membership provisioning, the Zoho
  connect **and** disconnect, the dry-run switch, a manual FX rate and clearing its override, and a
  card being quarantined from the CRM. Each of those now commits with its write rather than after it,
  so a failure between the two cannot leave the write without its record.
  Still **unaudited**, deliberately or not yet: `renamePartner`, `saveOrgSettings`,
  `saveDisplayCurrency`, `saveZohoBcc`, the nightly `refreshFxRate`, and `persistSweep`'s accounts and
  signals. Conversation create/rename/restore are unaudited **on purpose** — see the note further
  down; only deletion is recorded.
  A card quarantine is audited when it *happens*, not on every failed attempt: `zohoSyncAll` pushes
  serially and Inngest retries three times, so a Zoho outage would otherwise write a row per card per
  attempt and bury the entries that matter.
- **Org isolation is enforced in the repository layer, and now has a policy underneath it that is
  not yet switched on.** Every query filters on the session's `orgId`. `drizzle/0018` creates RLS
  policies on all **15** org-scoped tables (the count was recorded here as 13 and was wrong — count
  from the schema, never from this line; `zoho_push_attempts` is the sixteenth policy and `people`
  the seventeenth, scoped through its account because it has no `org_id` column) plus the
  NOBYPASSRLS role `growth_app`. `tests/integration/rls.test.ts` proves the policies deny by
  connecting as that role.
  **But `DATABASE_URL` still connects as `neondb_owner`, which bypasses RLS, so it is not enforcing
  anything today.** Do not describe this as two layers yet. Switching over requires the read path
  to run inside a transaction first: `withOrg()` wraps writes only, `current_setting('app.org_id',
  true)` is NULL outside it, and `org_id = NULL` is never true — so flipping the role right now
  makes every page in the app render empty. The cost is three extra round trips per read (BEGIN,
  set_config, COMMIT), which is ~700ms from India to `us-east-2`; the `ap-south-1` move in
  docs/CLAIM-NEON.md is what makes it affordable. Until then the explicit `orgId` predicate is
  still the isolation.
- **`withOrg()` is not inert, whatever the GUC sentence above implies.** It is a real
  transaction, and `src/lib/zoho/token.ts` depends on that for `SELECT … FOR UPDATE` on the
  connection row — flattening it into a plain query removes the token-refresh lock and lets N
  parallel jobs each burn one of Zoho's 10-per-10-minutes token requests.
- Any `fetch` inside `withOrg` must be bounded well under `idle_in_transaction_session_timeout`
  (15s). The pool's `statement_timeout` bounds the *query*, not the fetch, and the fetch is
  holding a pooled connection open inside a transaction. The token refresh uses
  `AbortSignal.timeout(10_000)` for exactly this reason.
- **The §8 boundary has an outbound half too.** `SyncCard` (`src/domain/zoho/types.ts`) has no
  email/phone/address field and must never gain one — a mapper cannot leak what it cannot be
  handed. `src/domain/zoho/forbidden.ts` is the single definition of the contact-shaped patterns,
  and `scripts/check-compliance.mts` imports it, so CI and the unit tests cannot drift onto
  different patterns. It matches in JS, not SQL: the pattern uses lookbehind, and Postgres `~*`
  is not guaranteed to read it the same way.

## Conversations

`conversations` replaced the single `threads` row per user (2026-09-04). One row per named
conversation, messages still a JSON blob — a conversation is always read and written whole, and the
200-turn cap applies cleanly per conversation.

- **Chat is the only per-user surface.** `src/db/conversations.ts` filters every query on `orgId`
  **and** `userId`, so another operator's conversation id resolves to nothing rather than to their
  chat. Pipeline, Today, dashboard, accounts and settings stay org-wide.
- **`appendTurns` concatenates and trims inside one `UPDATE`.** The old `threads.appendTurns` read
  the array into Node, appended, and wrote it back — a lost update whenever two requests finished
  together. Verified: 20 concurrent appends, 20 turns land.
- **The brief is a pinned `kind='brief'` conversation**, one per user, guaranteed by a partial
  unique index on `(org_id, user_id) where kind = 'brief'` so the nightly job upserts instead of
  select-then-write. It sorts first in the switcher and cannot be renamed or deleted — it is
  rewritten every morning, so neither would stick.
- **`threads` still exists, unused.** Migration `0004` copied every row across; leaving the table is
  what makes that reversible. Dropping it is a separate step.
- Server actions live in `src/app/actions/conversations.ts`. Only **delete** writes an audit row
  (`conversation_deleted`): creating and renaming your own chat is not destructive, and a row per
  "New conversation" click would bury the entries that matter.

## State that survives a refresh

Two layers, deliberately separate:

- **Server** — the chat conversation. `api/chat/stream/route.ts` calls `appendTurns` when generation
  completes, *before* the `done` frame and before closing, so an answer still lands in history if
  the operator refreshed or closed the tab mid-stream. That only works because `send()` swallows the
  "Controller is already closed" throw a disconnect causes: before that guard existed the throw
  unwound the loop and the persist never ran, so the guarantee this paragraph makes was false. `chat/page.tsx` server-renders it; there is no client
  fetch on mount.
- **Browser** — `useWorkspace` in `src/store/selection.ts` (zustand `persist`): composer draft,
  selected card **id**, inspector open/closed, pipeline cursor. **Ids and view state only, never
  server-owned rows** — a restored row would show stale numbers. `skipHydration` is set and the
  store rehydrates after mount (`providers.tsx`); reading storage during the first render would be a
  hydration mismatch. Access `.persist` optionally — zustand attaches no persist API at all when the
  browser blocks storage.

## Layout

`src/domain/` is pure — no I/O, no imports from `db`, `lib`, `engine` or `app`. **This is now an
eslint rule, not a convention** (`eslint.config.mjs`): a `fetch` or one of those imports under
`src/domain/**` fails the build, tests included. It holds the scoring, routing, signal-decay and
revenue math *and the entire Zoho mapping* (`src/domain/zoho/`) — the part that decides what is
written into a client's live CRM, and therefore the part that must stay under test.
`src/lib/zoho/card.ts` is the deliberate seam: `PipelineCardRow` is database-shaped, so the
adapter lives in `lib`, not `domain`.
`src/engine/` owns Claude calls, prompt caching, and Zod schemas.
`prompts/` holds **four** system prompts across three files, versioned: `ENGINE_SYS` and
`EXTRACT_SYS` (`prompts/engine.ts`), `MAIL_SYS`, `SWEEP_SYS`. The prototype's `INSIGHT_SYS` and
`ROOM_SYS` were never ported — do not go looking for them. `EXTRACT_SYS` has no prototype
ancestor; it exists because `ENGINE_SYS` dropped the mandatory `ENGINE_JSON:` tail.

## Commands

```
pnpm dev            # Turbopack dev server
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations
pnpm db:seed        # load universe, practices, towers, signals
pnpm lint           # eslint (also proves the domain-purity rule still passes)
pnpm typecheck      # next typegen && tsc --noEmit
pnpm db:check-compliance   # PRD §8 — scans the LIVE schema, views included
pnpm db:check-auth  # Better Auth runtime-vs-database schema drift
pnpm db:backup --verify    # dump, then prove it by restoring into a scratch DB
```
