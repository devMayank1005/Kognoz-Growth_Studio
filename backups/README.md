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

## What `--verify` actually checks

The table list is read from `information_schema` on both sides, never written into
the script. It used to be a hardcoded array of 17 names against a schema of 24,
and it omitted `conversations` — the table this README promises holds a
recoverable morning brief — along with `zoho_push_attempts` and
`zoho_connections`, while still counting the dead `threads`. The closing line said
"every table matches", which could not be true of a table it never queried.

Three checks now, in order:

1. **The table sets must match.** A table that exists live and did not survive the
   dump is named and the verify fails. This is the one a row count cannot make:
   there is nothing on the restored side to count.
2. **Row counts, table by table**, for every table found.
3. **Content spot-checks**, because counts pass on an empty-but-present table — a
   sourced signal, a draft's subject, and the brief conversations this README
   promises.

A successful run writes `backups/LAST-VERIFIED.md`. The dumps are gitignored
because they hold real email addresses (PRD §8), so that file is the only evidence
a backup was ever proved; commit it.
