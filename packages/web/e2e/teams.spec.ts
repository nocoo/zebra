import { test, expect } from "@playwright/test";

test.describe("teams pages", () => {
  test("teams list page loads", async ({ page }) => {
    await page.goto("/teams");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Team");
  });

  test("team detail page loads", async ({ page }) => {
    await page.goto("/teams/test-team-id");
    // Should not crash
    const url = page.url();
    expect(url).toContain("/teams");
  });
});
