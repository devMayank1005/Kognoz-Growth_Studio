import { expect, test } from "@playwright/test";

import { signIn } from "./session";

/**
 * Guards the shell against the hydration regression found on 2026-09-04.
 *
 * The status line formatted a time with the host locale, so server and browser
 * disagreed and React regenerated the tree — clearing every attribute on <html>
 * and discarding the operator's saved theme on every page load.
 * A mismatch anywhere in the shell makes React regenerate the tree, which
 * clears every attribute on <html> — including the data-theme the blocking head
 * script set.
 */
test("shell hydrates without a mismatch and keeps the saved theme", async ({ page, context }) => {
  await signIn(context);

  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  // Pretend the operator chose light, the way the real toggle does.
  await page.addInitScript(() => localStorage.setItem("gs-theme", "light"));

  for (const path of ["/pipeline", "/dashboard", "/settings"]) {
    await page.goto(path);
    // Wait for a control that only exists once the shell has hydrated, rather
    // than networkidle — the database is ~280ms away, so networkidle is timing
    // dependent and made this flaky under load.
    await expect(page.getByRole("group", { name: "Appearance" })).toBeVisible();

    const theme = await page.getAttribute("html", "data-theme");
    console.log(`  ${path.padEnd(11)} data-theme after hydration = ${theme}`);
    expect(theme, `${path} lost the saved theme`).toBe("light");
  }

  const hydration = errors.filter((e) => /hydrat/i.test(e));
  console.log(`  hydration errors: ${hydration.length}`);
  for (const h of hydration.slice(0, 2)) console.log(`    ${h.slice(0, 200)}`);
  expect(hydration, "hydration mismatch in the shell").toHaveLength(0);
});

test("appearance control sits in the status line and switches the theme", async ({ page, context }) => {
  await signIn(context);
  await page.goto("/pipeline");

  const group = page.getByRole("group", { name: "Appearance" });
  await expect(group).toBeVisible();

  await group.getByRole("button", { name: "Late shift" }).click();
  await expect.poll(() => page.getAttribute("html", "data-theme")).toBe("dark");

  await group.getByRole("button", { name: "Briefing Room" }).click();
  await expect.poll(() => page.getAttribute("html", "data-theme")).toBe("light");

  // The Settings copy must agree with the status-line copy.
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: "Briefing Room" }).first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});
