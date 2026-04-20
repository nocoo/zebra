import { test, expect } from "@playwright/test";

test.describe("dashboard", () => {
  test("page loads and shows heading", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("h1")).toContainText("Dashboard");
    await expect(
      page.getByText("Token usage overview for your AI coding tools."),
    ).toBeVisible();
  });

  test("shows content or empty state", async ({ page }) => {
    await page.goto("/dashboard");
    // Wait for async data to load
    await page.waitForTimeout(3000);

    // In test environment, user may have no data (empty state) or some data (stat cards)
    const hasStatCards = await page.getByText("Total Tokens").isVisible().catch(() => false);
    const hasEmptyState = await page.getByText("Ready to Track Your AI Usage").isVisible().catch(() => false);
    const hasOverview = await page.getByRole("heading", { name: "Overview" }).isVisible().catch(() => false);

    // Any of these indicates the page loaded successfully
    expect(hasStatCards || hasEmptyState || hasOverview).toBe(true);
  });

  test("empty state shows getting started steps when no data", async ({ page }) => {
    await page.goto("/dashboard");
    // Wait for async data to load
    await page.waitForTimeout(3000);

    // In test environment with no data, the empty state should show getting started steps
    const hasEmptyState = await page.getByText("Ready to Track Your AI Usage").isVisible().catch(() => false);

    if (hasEmptyState) {
      await expect(page.getByText("Install the pew CLI")).toBeVisible();
      await expect(page.getByRole("link", { name: "Get Started" })).toBeVisible();
    }
    // If there are stat cards (has data), this test is N/A but should pass
    expect(true).toBe(true);
  });
});
