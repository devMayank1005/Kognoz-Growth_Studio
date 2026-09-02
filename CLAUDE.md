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
- Full breaking-change list: `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`.

## Anthropic API rules (do not regress these)

- Model is **`claude-opus-5`**. The PRD's `claude-sonnet-4-6` is a stale ID — do not copy it from
  the prototype. Extraction runs on `claude-haiku-4-5`.
- Web search tool is **`web_search_20260209`**, not the prototype's `web_search_20250305`.
- **Never** send `budget_tokens` or `temperature` — both return 400 on Opus 5.
- Fast Mode needs all three together: `client.beta.messages.stream(...)`,
  `betas: ["fast-mode-2026-02-01"]`, and top-level `speed: "fast"`. On 429, drop `speed` and retry.
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
