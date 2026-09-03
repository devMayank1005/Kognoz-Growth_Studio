# The Neon database

**Status: claimed and owned.** Claimed 2026-09-03; `neon claim status` reports `reconciled`. The
original expiry no longer applies.

| | |
|---|---|
| Project | `wispy-tree-92088623` |
| Branch | `br-square-violet-axo3jxa9` |
| Region | `us-east-2` |
| Endpoint | `ep-gentle-glade-axg6kozp` |

This was originally a *claimable* project — provisioned without an account so the build could start
immediately — and has since been transferred into a real Neon account.

## The trap that bit during the claim

Claiming rotates the database password. `npx neon@latest env pull` updates **`DATABASE_URL`** and
nothing else, so **`DATABASE_URL_UNPOOLED` kept the old, revoked password** and every migration and
`pg_dump` failed with `password authentication failed`.

That second variable is ours, not Neon's, which is why their tooling does not touch it. After any
future credential rotation, derive it from the freshly pulled pooled URL by removing `-pooler` from
the host:

```
DATABASE_URL           ep-gentle-glade-axg6kozp-pooler.c-4.us-east-2.aws.neon.tech   (app)
DATABASE_URL_UNPOOLED  ep-gentle-glade-axg6kozp.c-4.us-east-2.aws.neon.tech          (migrations, pg_dump)
```

Neon's pooler does not carry the session state that migrations and dumps need, which is the whole
reason the split exists.

After rotating, restart the dev server and re-run `pnpm db:check-auth` and
`pnpm db:check-compliance`.

## Backups

`pnpm db:backup --verify` dumps and then proves the dump by restoring it into a local scratch
database and comparing every table. See `backups/README.md`. Run it before anything risky — a
migration you are unsure about, or a region move.

## Still worth doing: move region before production

The project sits in `us-east-2`. Warm queries measured **1.4–1.9s from India**, and PRD §8's
DPDP/PDPL posture points at an Asian region.

This is now an unhurried job, because a verified backup exists: create a project in `ap-south-1`
(Mumbai) or `ap-southeast-1` (Singapore), restore a dump into it, and repoint both URLs.

```bash
pnpm db:backup --verify
createdb-equivalent on the new project, then:
pg_restore --no-owner --no-privileges -d "<new DIRECT connection string>" backups/growth-studio-<timestamp>.dump
```
