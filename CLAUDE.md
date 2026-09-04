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

## Hard product rules (PRD §8 — compliance, not preferences)

- **No personal contact data anywhere.** `people` carries name, title, company, date, public
  source only. No email, phone, address, or personal social columns — not in the schema, not in a
  form, not in a prompt, not searched for. Company-published generic mailboxes only; never guessed.
- **DNC blocks add, draft, and packet** — every path, enforced in the domain layer.
- Every mutation writes an audit entry.
- **Org isolation is enforced ONCE, in the repository layer.** Every query filters on the session's
  `orgId`. **Postgres RLS is not enabled** — verified 2026-09-04: `pg_policies` is empty, 0 of 22
  tables have `relrowsecurity`, and both connection strings use `neondb_owner`, which has
  `rolbypassrls = true`, so policies would be ignored even if added. `withOrg()` sets an
  `app.org_id` GUC that nothing currently reads; it is kept because it is the hook real policies
  would use. Do not describe this as two layers. Adding a second org REQUIRES doing RLS first:
  policies on all 12 org-scoped tables plus a NOBYPASSRLS application role.

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

`src/domain/` is pure — no I/O, no imports from `db` or `engine`. It holds the scoring, routing,
signal-decay, and revenue math, and it is the part that must stay under test.
`src/engine/` owns Claude calls, prompt caching, and Zod schemas.
`prompts/` holds the five system prompts, versioned.

## Commands

```
pnpm dev            # Turbopack dev server
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright
pnpm db:generate    # drizzle-kit generate
pnpm db:migrate     # apply migrations
pnpm db:seed        # load universe, practices, towers, signals
```
