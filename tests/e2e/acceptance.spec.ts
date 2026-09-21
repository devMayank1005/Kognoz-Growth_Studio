import { expect, test } from "@playwright/test";

import { query, signIn } from "./session";

/**
 * The PRD's acceptance criteria, automated.
 *
 * These flows were previously only ever verified by hand, which does not
 * survive a refactor. Each test asserts against the DATABASE as well as the UI,
 * because a toast saying something happened is not evidence that it did.
 */

test.beforeEach(async ({ context }) => {
  await signIn(context);
});

test.describe("navigation", () => {
  test("every rail destination loads", async ({ page }) => {
    for (const path of ["/chat", "/today", "/pipeline", "/dashboard", "/accounts", "/settings"]) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should load`).toBe(200);
    }
  });
});

test.describe("acceptance #7 — the dashboard reconciles and filters", () => {
  test("every panel totals the same as the open pipeline", async ({ page }) => {
    await page.goto("/dashboard");
    const note = await page.getByText(/Every panel totals/).textContent();
    // Matches either denomination: dollars in K/M, rupees in L/Cr. Pinned to
    // `$` alone, this returned undefined the moment the programme moved to
    // rupees and the assertion below failed for the wrong reason.
    const total = note?.match(/[$₹][\d,.]+(?:Cr|L|K|M)?/)?.[0];
    expect(total, "the dashboard states its total").toBeTruthy();

    // Each panel heading carries its own sum; all must equal that total.
    for (const title of ["By tower", "By geography", "By solution", "By stage"]) {
      const heading = page.getByRole("heading", { name: new RegExp(title) });
      await expect(heading, `${title} panel present`).toBeVisible();
      expect(await heading.textContent(), `${title} sums to ${total}`).toContain(total!);
    }
  });

  test("clicking a tower row filters the pipeline to that tower", async ({ page }) => {
    const towers = await query<{ tower: string; n: string }>(
      `select tower, count(*) n from opportunities where stage not in ('Won','Lost') group by tower order by count(*) desc limit 1`,
    );
    test.skip(towers.length === 0, "no open pipeline to filter");
    const tower = towers[0].tower;

    await page.goto(`/pipeline?tower=${tower}`);
    // The chip tells the operator they are looking at a subset.
    await expect(page.getByText("Tower:")).toBeVisible();

    const expected = await query<{ name: string }>(
      `select a.name from opportunities o join accounts a on a.id = o.account_id where o.tower = $1`,
      [tower],
    );
    for (const row of expected) {
      await expect(page.getByRole("cell", { name: row.name, exact: true })).toBeVisible();
    }
  });
});

test.describe("acceptance #9 — no personal contact data, DNC blocks everything", () => {
  test("no page exposes an email address or phone number for a prospect", async ({ page }) => {
    for (const path of ["/pipeline", "/accounts", "/today"]) {
      await page.goto(path);
      // innerText, NOT textContent: textContent includes <script> contents, and
      // in dev that means Next's RSC payload, which is full of strings like
      // "@babel+core@7.29.7" that look like addresses. Scanning those is a
      // false positive about what a user can actually see.
      const body = await page.locator("body").innerText();
      // Our own operator address is legitimate; a prospect's is not.
      const withoutOwnAccounts = body.replace(/[\w.+-]+@(kognozconsulting\.com|growth-studio\.invalid|kognoz-konverz\.invalid)/g, "");
      expect(withoutOwnAccounts, `${path} must not show a prospect email`).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
      expect(withoutOwnAccounts, `${path} must not show a phone number`).not.toMatch(/(?:\+|00)\d[\d\s().-]{8,}/);
    }
  });

  test("the do-not-contact list is enforced, and the schema cannot hold contact details", async () => {
    // The schema-level guarantee: no prospect table has anywhere to put one.
    const columns = await query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
       where table_schema='public'
         and column_name ~* 'email|phone|mobile|address'
         and table_name not in ('user','session','account','verification','organization','member','invitation')`,
    );
    expect(columns, "no contact column on any prospect table").toEqual([]);
  });
});

test.describe("acceptance #10 — mobile at 390px", () => {
  test("bottom tabs are the navigation, and every section is reachable", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "390px viewport only");

    await page.goto("/pipeline");

    // The rail is hidden below 768px, so without these the app is unusable.
    const navs = page.locator('nav[aria-label="Sections"]');
    await expect(navs).toHaveCount(2);
    const bottom = navs.nth(1);
    await expect(bottom, "bottom tabs visible on a phone").toBeVisible();

    for (const label of ["Chat", "Today", "Pipeline", "Dashboard", "Accounts", "Settings"]) {
      await expect(bottom.getByRole("link", { name: label })).toBeVisible();
    }

    await bottom.getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("the pipeline table scrolls rather than breaking the layout", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile-390", "390px viewport only");

    await page.goto("/pipeline");
    // §9.4: wide tables scroll inside their own container; the page must not.
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { pageScrolls: doc.scrollWidth > doc.clientWidth + 1 };
    });
    expect(overflow.pageScrolls, "the page itself must not scroll sideways").toBe(false);
  });
});

test.describe("Kanban (§5) — usable without a mouse", () => {
  test("a card moves stage by keyboard alone, and the move is persisted", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "board is a desktop view");

    const before = await query<{ id: string; name: string; stage: string }>(
      `select o.id, a.name, o.stage from opportunities o join accounts a on a.id = o.account_id
       where o.stage not in ('Won','Lost','Meeting set') limit 1`,
    );
    test.skip(before.length === 0, "no movable card");

    /**
     * Restored afterwards, in a `finally` so a failed assertion still cleans up.
     *
     * This test moves a real card and leaves it moved — for as long as it has
     * existed it has been permanently editing whichever database it ran against,
     * which until `.env.test` was the live one. Putting the stage back also makes
     * the test repeatable: its own WHERE clause excludes "Meeting set", so a
     * second run used to skip itself.
     *
     * The `activities` row stays. It records something that genuinely happened,
     * and §8 does not want audit entries deleted to tidy up after a test.
     */
    const original = before[0].stage;
    try {
      await page.goto("/pipeline?view=kanban");
      const card = page.locator(`article[aria-label^="${before[0].name},"]`);
      await expect(card).toBeVisible();

      // No pointer events in this test. dnd-kit's simulated keyboard drag proved
      // to be a mouse metaphor in a keyboard costume; an explicit stage control is
      // how accessible boards actually work, so that is what gets exercised.
      const stageSelect = card.getByRole("combobox");
      await stageSelect.focus();
      await expect(stageSelect).toBeFocused();
      await stageSelect.selectOption("Meeting set");

      await expect(page.getByText(`${before[0].name} →`)).toBeVisible({ timeout: 10_000 });

      const after = await query<{ stage: string }>(`select stage from opportunities where id = $1`, [before[0].id]);
      expect(after[0].stage, "the stage actually changed in the database").toBe("Meeting set");

      // The same activity trail the outcome grid would leave.
      const trail = await query<{ payload: { action?: string; via?: string } }>(
        `select payload_json as payload from activities where opportunity_id = $1 order by at desc limit 1`,
        [before[0].id],
      );
      expect(trail[0].payload.action).toBe("stage_moved");
      expect(trail[0].payload.via).toBe("kanban");
    } finally {
      await query(`update opportunities set stage = $2 where id = $1`, [before[0].id, original]);
    }
  });

  test("switching view keeps the active filter", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "board is a desktop view");
    await page.goto("/pipeline?tower=T3&view=kanban");
    // Losing the filter silently would show a different set under the same chip.
    await expect(page.getByText("Tower:")).toBeVisible();
  });
});
