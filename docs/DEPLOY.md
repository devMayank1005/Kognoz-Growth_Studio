# Deployment

Production: **https://kognoz-growthstudio.vercel.app**

## Verified live (2026-09-03)

Probing the deployed app's own OAuth start endpoint proves a lot at once, because
`src/lib/auth.ts` throws at import time when its configuration is missing. The endpoint responding
correctly means all of the following are set in Vercel:

| Variable | How it was proven |
|---|---|
| `DATABASE_URL` | `auth.ts` imports `db/client`, which throws without it |
| `BETTER_AUTH_SECRET` | Better Auth refuses to start without it |
| `BETTER_AUTH_URL` | the returned `redirect_uri` is the production URL, not localhost |
| `MICROSOFT_CLIENT_ID` / `_SECRET` | present in the authorize URL |
| `MICROSOFT_TENANT_ID` | the authorize URL is tenant-scoped, not `/common` |
| `ALLOWED_EMAIL_DOMAINS` | `auth.ts` throws deliberately on an empty allowlist |

The exact redirect URI Microsoft will receive:

```
https://kognoz-growthstudio.vercel.app/api/auth/callback/microsoft
```

**That exact string must be registered in the Entra app registration** — the site root alone is not
enough and produces a redirect-URI mismatch. Keep `http://localhost:3001/api/auth/callback/microsoft`
alongside it so local development keeps working.

## Still to confirm

- **`ANTHROPIC_API_KEY`** — the Anthropic SDK reads it implicitly via `new Anthropic()`, so it never
  appears in a `process.env` search of the codebase and is easy to leave off a checklist. It is only
  exercised by the chat and sweep routes, so it cannot be proven from outside without signing in.
- **`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`** — `/api/inngest` returns `401 Unauthorized` to an
  unsigned caller, which is correct behaviour for a protected endpoint but does not by itself prove
  the app is synced.

## Inngest

Keys alone do not schedule anything. Inngest has to be told where the functions live.

1. Create an account and app at inngest.com.
2. Copy the **Event Key** and **Signing Key** into Vercel (Production scope).
3. **Redeploy** — Vercel does not apply new environment variables to an existing deployment.
4. In the Inngest dashboard, register the app URL:
   **`https://kognoz-growthstudio.vercel.app/api/inngest`**

Success looks like one function, `daily-sweep`, listed with the cron
`TZ=Asia/Kolkata 30 5 * * *`. Nothing listed means the sync never reached the endpoint.

**Locally, Inngest needs no account at all** — `npx inngest-cli dev` discovers
`localhost:3001/api/inngest` by itself. The keys are for deployed environments only.

## The test that matters

Once synced, **trigger `daily-sweep` manually from the Inngest dashboard** rather than waiting for
05:30. It costs roughly 11 model calls and exercises the entire loop: 11 sweeps run, findings
persist with real source URLs, and the morning brief is written to the operator's thread.

Then open `/chat`. A brief nobody asked for should be waiting, and `sweep_runs` should hold 11 new
rows. That is the moment this stops being a deployed page and starts being the product.

## Known follow-ups

- The database is in **`us-east-2`**; warm queries measured 1.4–1.9s from India. PRD §8's DPDP/PDPL
  posture points at `ap-south-1` or `ap-southeast-1`. A verified backup exists, so moving is a
  restore rather than a risk — see `docs/CLAIM-NEON.md`.
- Three of four partners are still placeholders; rename them in Settings.
- 20 of 22 signals are seed fixtures, distinguishable by having no source URL. Real sweeps will
  crowd them out.
