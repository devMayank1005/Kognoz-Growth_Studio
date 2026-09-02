/**
 * Seeds one organisation with the account universe, verified people, partners,
 * and development signal fixtures.
 *
 * Idempotent: every write is an upsert keyed on a natural key, so re-running
 * refreshes rather than duplicating. Safe to run against a database that
 * already has data.
 *
 * Run with: pnpm db:seed
 */

import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { industryOf } from "@/domain/industry";
import { TOWERS, TOWER_KEYS } from "@/domain/practices";
import { signalByCode } from "@/domain/signals";

import * as schema from "./schema";
import { SEED_PEOPLE, SEED_UNIVERSE, SIGNAL_FIXTURES } from "./seed-data";

config({ path: ".env.local" });
config({ path: ".env" });

const ORG_SLUG = "kognoz-konverz";
const ORG_NAME = "Kognoz / Konverz AI";

/** PRD §4.1 — the five daily radar markets. */
const RADAR_MARKETS = ["India", "UAE", "Saudi Arabia", "Philippines", "Malaysia"];

/** PRD §0 / prototype line 242. */
const ICP_TEXT =
  "Companies with roughly 2,000+ employees OR $100M+ revenue, plus a scaling exception: 500+ announced hires, IPO/PE event, or a mega-project. In scope: banks, insurers, NBFCs/finance, BPO/GBS and GCCs, IT services, QSR/retail/consumer frontline, conglomerates and family groups, developers/real estate, energy/industrial/manufacturing, aviation, telecom, healthcare/pharma. Out: government ministries, holding shells, small companies below the floor.";

/** Marks fixture evidence so it can never read as sourced intelligence. */
const FIXTURE_MARKER = " [seed fixture — not verified]";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");

  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool, schema });

  console.log("Seeding Growth Studio\n");

  /* ------------------------------------------------------------- org */
  const [org] = await db
    .insert(schema.organization)
    .values({ id: randomUUID(), name: ORG_NAME, slug: ORG_SLUG, createdAt: new Date() })
    .onConflictDoUpdate({ target: schema.organization.slug, set: { name: ORG_NAME } })
    .returning();
  console.log(`  org         ${org.name} (${org.id})`);

  // Programme clock starts today on a fresh seed and is left alone afterwards,
  // so re-seeding never silently moves the $20M curve.
  await db
    .insert(schema.settings)
    .values({
      orgId: org.id,
      programStart: iso(new Date()),
      icpText: ICP_TEXT,
      radarMarkets: RADAR_MARKETS,
      dailyCallBudget: 60,
    })
    .onConflictDoUpdate({
      target: schema.settings.orgId,
      set: { icpText: ICP_TEXT, radarMarkets: RADAR_MARKETS },
    });
  console.log(`  settings    ICP, ${RADAR_MARKETS.length} radar markets, budget 60 calls/day`);

  /* -------------------------------------------------------- partners */
  // Placeholders: routing and the acceptance tests work today, and these are
  // renamed in Settings without a reseed.
  const partnerIds: Record<string, string> = {};
  for (const tower of TOWER_KEYS) {
    const email = `partner.${tower.toLowerCase()}@${ORG_SLUG}.invalid`;
    const name = `Partner — ${tower} ${TOWERS[tower].short}`;
    const [u] = await db
      .insert(schema.user)
      .values({ id: randomUUID(), name, email, emailVerified: false, createdAt: new Date(), updatedAt: new Date() })
      .onConflictDoUpdate({ target: schema.user.email, set: { name } })
      .returning();
    partnerIds[tower] = u.id;

    const existing = await db
      .select({ id: schema.member.id })
      .from(schema.member)
      .where(sql`${schema.member.organizationId} = ${org.id} and ${schema.member.userId} = ${u.id}`);
    if (existing.length === 0) {
      await db.insert(schema.member).values({
        id: randomUUID(),
        organizationId: org.id,
        userId: u.id,
        role: "partner",
        createdAt: new Date(),
      });
    }
  }
  console.log(`  partners    ${TOWER_KEYS.length} placeholders, one per tower`);

  /* -------------------------------------------------------- accounts */
  const accountIdByName = new Map<string, string>();
  for (const a of SEED_UNIVERSE) {
    const [row] = await db
      .insert(schema.accounts)
      .values({
        orgId: org.id,
        name: a.name,
        country: a.country,
        segment: a.segment,
        // Derived by the tested domain function, never hand-maintained.
        industry: industryOf(a.segment),
        engine: a.engine,
        status: a.status,
        anchor: a.anchor,
      })
      .onConflictDoUpdate({
        target: [schema.accounts.orgId, schema.accounts.name],
        set: { country: a.country, segment: a.segment, industry: industryOf(a.segment), status: a.status, anchor: a.anchor },
      })
      .returning({ id: schema.accounts.id });
    accountIdByName.set(a.name, row.id);
  }
  console.log(`  accounts    ${accountIdByName.size} in the universe`);

  /* ---------------------------------------------------------- people */
  let peopleCount = 0;
  for (const p of SEED_PEOPLE) {
    const accountId = accountIdByName.get(p.company);
    if (!accountId) {
      console.warn(`  ! person "${p.name}" references unknown account "${p.company}" — skipped`);
      continue;
    }
    const existing = await db
      .select({ id: schema.people.id })
      .from(schema.people)
      .where(sql`${schema.people.accountId} = ${accountId} and ${schema.people.name} = ${p.name}`);
    if (existing.length === 0) {
      await db.insert(schema.people).values({
        accountId,
        name: p.name,
        role: p.role,
        source: p.source,
        verifiedAt: new Date(p.verifiedAt),
      });
    }
    peopleCount++;
  }
  console.log(`  people      ${peopleCount} verified (name, title, source, as-of only)`);

  /* ------------------------------------------------- signal fixtures */
  let signalCount = 0;
  for (const s of SIGNAL_FIXTURES) {
    const accountId = accountIdByName.get(s.account);
    if (!accountId) {
      console.warn(`  ! signal references unknown account "${s.account}" — skipped`);
      continue;
    }
    const tier = signalByCode(s.code)?.tier;
    if (!tier) {
      console.warn(`  ! signal "${s.code}" is not in the ratified taxonomy — skipped`);
      continue;
    }
    const date = daysAgo(s.ageDays);
    const existing = await db
      .select({ id: schema.signals.id })
      .from(schema.signals)
      .where(sql`${schema.signals.accountId} = ${accountId} and ${schema.signals.code} = ${s.code}`);
    if (existing.length === 0) {
      await db.insert(schema.signals).values({
        orgId: org.id,
        accountId,
        code: s.code,
        tier,
        headline: s.headline,
        // Marked and unsourced on purpose — this is development data.
        evidence: s.evidence + FIXTURE_MARKER,
        url: null,
        date,
        confidence: 0,
      });
    }
    signalCount++;
  }
  console.log(`  signals     ${signalCount} DEVELOPMENT FIXTURES (confidence 0, no source URL)`);

  await pool.end();

  console.log("\nDone.");
  console.log("Signal fixtures are marked and unsourced — they are not real intelligence.");
  console.log("Rename the four partners in Settings whenever the real sellers are decided.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
