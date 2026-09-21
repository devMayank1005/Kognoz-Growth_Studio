import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  loadAccountDossier, loadAccountList, loadAccountOptions, loadDnc, loadPartnersByTower,
  loadPartnerUserIds, loadPipeline, loadSignals, loadSweepStatus, loadUniverse, loadVerifiedPeople,
} from "@/db/queries";
import { defaultConversationId, listConversations, loadConversation } from "@/db/conversations";
import { loadZohoStatus } from "@/db/zoho";
import { loadMoneyView } from "@/lib/money-view";

import { dropTenants, leaks, seedTenant, type Tenant } from "./fixture";

/**
 * Org isolation, with two orgs in the database.
 *
 * Nothing in the unit suite could catch a dropped `where orgId = …`: it is pure
 * by lint rule and never opens a connection, and with one org every row belongs
 * to the only tenant there is. RLS is not enabled either — `withOrg` sets an
 * `app.org_id` GUC that no policy reads — so ~90 hand-written predicates are the
 * entire mechanism. This is the test that fails when one of them goes missing.
 *
 * Two shapes of assertion:
 *   1. A loader given org A must return nothing labelled "B-only".
 *   2. A loader given org A AND org B's row id must return nothing at all —
 *      the IDOR case, where an id is guessed rather than listed.
 *
 * What this cannot catch, stated plainly: the `orgId` predicates added to
 * `loadAccountDossier`'s four child queries are defense in depth, and removing
 * one keeps this suite green. Those rows hang off an account already checked
 * against the org, so while that check stands there is no leak to observe — the
 * predicates earn their keep only if a later refactor drops the parent check,
 * which is exactly the kind of change a test cannot anticipate. Verified by
 * deleting each predicate in turn: the list loaders go red, the dossier's
 * children do not.
 */

let a: Tenant;
let b: Tenant;

beforeAll(async () => {
  a = await seedTenant("A");
  b = await seedTenant("B");
}, 30_000);

afterAll(async () => {
  await dropTenants(a, b);
});

describe("org-scoped list loaders", () => {
  const cases: Array<[string, (orgId: string, userId: string) => Promise<unknown>]> = [
    ["loadUniverse", (org) => loadUniverse(org)],
    ["loadSignals", (org) => loadSignals(org)],
    ["loadVerifiedPeople", (org) => loadVerifiedPeople(org)],
    ["loadPipeline", (org) => loadPipeline(org)],
    ["loadPartnersByTower", (org) => loadPartnersByTower(org)],
    ["loadPartnerUserIds", (org) => loadPartnerUserIds(org)],
    ["loadDnc", (org) => loadDnc(org)],
    ["loadSweepStatus", (org) => loadSweepStatus(org)],
    ["loadAccountList", (org) => loadAccountList(org)],
    ["loadAccountOptions", (org) => loadAccountOptions(org)],
    ["loadMoneyView", (org) => loadMoneyView(org)],
    ["loadZohoStatus", (org) => loadZohoStatus(org)],
    ["listConversations", (org, user) => listConversations(org, user)],
  ];

  for (const [name, call] of cases) {
    it(`${name} shows org A nothing of org B's`, async () => {
      const seen = await call(a.orgId, a.userId);
      expect(leaks(seen, b.label), `${name} leaked B into A`).toEqual([]);
    });

    it(`${name} shows org B nothing of org A's`, async () => {
      // Both directions, so a predicate accidentally pinned to one org is caught.
      const seen = await call(b.orgId, b.userId);
      expect(leaks(seen, a.label), `${name} leaked A into B`).toEqual([]);
    });
  }

  it("actually returns org A's own rows, so the assertions above are not vacuous", async () => {
    // A loader that returned nothing would pass every leak check.
    const pipeline = await loadPipeline(a.orgId);
    expect(leaks(pipeline, a.label)).toEqual([`${a.label}-only`]);
    const universe = await loadUniverse(a.orgId);
    expect(leaks(universe, a.label)).toEqual([`${a.label}-only`]);
  });
});

describe("id-taking loaders refuse another org's id", () => {
  it("loadAccountDossier returns null for org B's account", async () => {
    expect(await loadAccountDossier(a.orgId, b.accountId)).toBeNull();
  });

  it("loadAccountDossier returns org A's own account", async () => {
    const own = await loadAccountDossier(a.orgId, a.accountId);
    expect(own).not.toBeNull();
    expect(leaks(own, b.label)).toEqual([]);
  });

  it("loadAccountDossier's child rows carry no other org's data", async () => {
    // The four child queries filtered on accountId alone until this was fixed.
    const own = await loadAccountDossier(a.orgId, a.accountId);
    expect(leaks(own?.signals, b.label)).toEqual([]);
    expect(leaks(own?.people, b.label)).toEqual([]);
    expect(leaks(own?.cards, b.label)).toEqual([]);
    expect(leaks(own?.timeline, b.label)).toEqual([]);
  });

  it("loadConversation returns null for another org's conversation", async () => {
    expect(await loadConversation(a.orgId, a.userId, b.conversationId)).toBeNull();
  });

  it("loadConversation returns null for another USER in the same org", async () => {
    // Chat is the one per-person table; org alone is not enough.
    expect(await loadConversation(a.orgId, b.userId, a.conversationId)).toBeNull();
  });

  it("loadConversation returns null for a malformed id rather than throwing", async () => {
    // The column is uuid, so this used to be a Postgres syntax error and a 500.
    expect(await loadConversation(a.orgId, a.userId, "not-a-uuid")).toBeNull();
  });

  it("loadConversation returns the caller's own conversation", async () => {
    const own = await loadConversation(a.orgId, a.userId, a.conversationId);
    expect(own).not.toBeNull();
    expect(leaks(own, b.label)).toEqual([]);
  });

  it("defaultConversationId never resolves to another org's conversation", async () => {
    const id = await defaultConversationId(a.orgId, a.userId);
    expect(id).not.toBe(b.conversationId);
  });
});
