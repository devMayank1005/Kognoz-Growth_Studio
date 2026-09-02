# Claiming the Neon database

The database was provisioned as a **claimable** Neon project — created without an account so the
build could start immediately. Claiming transfers it into a Neon account you own.

| | |
|---|---|
| Project | `wispy-tree-92088623` |
| Branch | `br-square-violet-axo3jxa9` |
| Region | `us-east-2` |
| **Expires** | **2026-09-05 11:30 UTC** unless claimed |

**There is no rush, because there is a verified backup.** Run `pnpm db:backup --verify` before you
start, and the worst case is a restore rather than a loss.

## The sequence

```bash
# 1. Confirm it is still unclaimed and how long is left
npx neon@latest claim status

# 2. Mint a claim code and open the browser. THE CODE EXPIRES IN 15 MINUTES,
#    so run this only when you are ready to sign in.
npx neon@latest claim accept
```

Sign in to Neon in the browser that opens. You can create an account during the flow (Google or
GitHub). Continuing on that page starts the transfer.

```bash
# 3. Pull the ROTATED connection string — see the trap below
npx neon@latest env pull

# 4. Confirm the app still works against the new connection
pnpm db:check-auth
pnpm db:check-compliance
```

Then restart the dev server so it picks up the new `DATABASE_URL`.

## Traps

**`DATABASE_URL` rotates the moment you claim.** The pre-claim URL and its access tokens are
revoked. Anything still holding the old one — a running dev server, a deploy — breaks until
`env pull` and a restart. This is expected, not a fault.

**The claim code expires in 15 minutes.** Minting a new one cancels the previous unused code, so
only the latest works. You can mint as often as you like while the project itself has not expired.

**`env pull` writes to `.env.local`.** It will not clobber unrelated keys, but check the file
afterwards — `DATABASE_URL_UNPOOLED` (the direct endpoint used for migrations and `pg_dump`) may
need updating by hand to match the new host with `-pooler` removed.

**Claiming does not change the region.** The project stays in `us-east-2`. Moving it is a separate
job: create a project in `ap-south-1` (Mumbai) or `ap-southeast-1` (Singapore) and restore a dump
into it. Worth doing before production for latency from India and the DPDP/PDPL posture in PRD §8 —
warm queries from India measured 1.4–1.9s against `us-east-2`.

## If it expires anyway

Nothing is lost provided a backup exists. Create a new Neon project and:

```bash
pg_restore --no-owner --no-privileges -d "<new direct connection string>" backups/growth-studio-<timestamp>.dump
```

Then update `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in `.env.local`. See `backups/README.md`.
