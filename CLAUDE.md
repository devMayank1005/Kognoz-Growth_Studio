@AGENTS.md

# Growth Studio

Partner-led sales intelligence console for Kognoz / Konverz. Chat-first: ask a question →
streamed answer → action table → `＋ Add` → routed pipeline card → Zoho.

**The PRD in `docs/Growth_Studio_PRD.md` is the contract.** `docs/konverz-sales-copilot.jsx` is
the reference prototype — behaviour, prompts, and routing logic come from there. When they
disagree, the PRD wins on scope and the prototype wins on behaviour.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Motion
Neon Postgres · Drizzle · Better Auth · Inngest · Anthropic SDK
TanStack Query + Table · Zustand · Zod · Vitest · Playwright

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

## Deployment

Production: **https://kognoz-growthstudio.vercel.app** (Vercel). Runbook: `docs/DEPLOY.md`.

- `BETTER_AUTH_URL` must be the production URL, and the Entra app must register the full callback
  path `.../api/auth/callback/microsoft`, not the site root.
- `ANTHROPIC_API_KEY` is read implicitly by the SDK, so it never shows up in a `process.env` search
  — easy to omit from an env checklist.
- Inngest needs the app **synced** (register `/api/inngest` in its dashboard), not just the keys.
  Locally it needs no account: `npx inngest-cli dev`.

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
- Org isolation is enforced twice: `orgId` in the repository layer *and* Postgres RLS.

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
