# Backups

Database dumps live here. **They are gitignored and must stay that way** — they contain real user
email addresses, and PRD §8 asks for a conservative posture on exactly that. This README is tracked;
the dumps are not.

## Taking one

```bash
pnpm db:backup            # dump only
pnpm db:backup --verify   # dump, then restore into a local scratch DB and compare row counts
```

Always use `--verify` when it matters. A backup you have not restored is not a backup — it is a file
you hope is a backup.

Two files are written per run:

- `growth-studio-<timestamp>.dump` — custom format. Compressed, restores selectively.
- `growth-studio-<timestamp>.sql` — plain SQL. Readable and greppable, and restorable by anything
  that speaks Postgres if `pg_restore` is ever unavailable.

## Restoring

Into a fresh database:

```bash
createdb growth_studio
pg_restore --no-owner --no-privileges -d growth_studio backups/growth-studio-<timestamp>.dump
```

Into a Neon project (use the **direct** endpoint — not the `-pooler` one; a restore needs session
state the pooler does not carry):

```bash
pg_restore --no-owner --no-privileges -d "$DATABASE_URL_UNPOOLED" backups/growth-studio-<timestamp>.dump
```

## What is worth protecting

Most of this database is reproducible — `pnpm db:seed` rebuilds the 174-account universe, the
fixture signals and the partners from source. What a restore genuinely recovers:

- Sweep findings with **live source URLs** — these came from real model calls against the real web.
  Re-running a sweep finds *different* news, not the same rows.
- Generated drafts.
- Opportunities and their full activity history (add → draft → sent → packet).
- Stored chat threads, including the morning brief.
- The Microsoft-linked user and OAuth account row.

## Version note

`pg_dump` must be at least the server's major version. At the time of writing both are **17.11**.
A version-skew failure is loud, not silent, so if the dump succeeds the versions were compatible.
