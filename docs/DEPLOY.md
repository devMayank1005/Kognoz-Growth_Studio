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
4. Sync the app. Either register the URL in the Inngest dashboard, or — faster, and scriptable —
   have the app register itself:

   ```bash
   curl -X PUT https://kognoz-growthstudio.vercel.app/api/inngest
   ```

   `{"message":"Successfully registered","modified":true}` means Inngest accepted it. Because the
   app authenticates that call with its own signing key, a success here also **proves the signing
   key in Vercel is correct** — a wrong key is rejected.

Success looks like one function, `daily-sweep`, listed with the cron
`TZ=Asia/Kolkata 30 5 * * *`. Nothing listed means the sync never reached the endpoint.

### Proving it from outside, without the dashboard

`/api/inngest` answers an unsigned `GET` with `401`, which proves only that a signing key is set. To
prove the key is the *right* one, sign the request the way Inngest does — reuse the SDK's own helper
rather than reimplementing HMAC:

```js
import { signDataWithKey } from "inngest/helpers/net";
const ts  = Math.round(Date.now() / 1000).toString();
const sig = await signDataWithKey("", process.env.INNGEST_SIGNING_KEY, ts, console);
await fetch(url, { headers: { "x-inngest-signature": `t=${ts}&s=${sig}` } });
```

A healthy production app answers `200` with:

```
app_id: "growth-studio"   function_count: 1        mode: "cloud"
has_event_key: true       has_signing_key: true    authentication_succeeded: true
```

`authentication_succeeded: true` is the line that matters — it means the key you signed with is the
key the deployment holds.

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
