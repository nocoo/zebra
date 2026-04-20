import { test, expect } from "@playwright/test";

test.describe("settings showcases page", () => {
  test("page loads (may show content or redirect)", async ({ page }) => {
    await page.goto("/settings/showcases");
    await page.waitForTimeout(2000);
    // The page either shows My Showcases, redirects to login, or shows the pew logo
    const url = page.url();
    const isOnPage = url.includes("/settings/showcases") || url.includes("/login");
    expect(isOnPage).toBe(true);
  });
});

test.describe("manage-projects page", () => {
  test("page loads and shows heading", async ({ page }) => {
    await page.goto("/manage-projects");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Project");
  });

  test("shows content", async ({ page }) => {
    await page.goto("/manage-projects");
    await page.waitForTimeout(3000);
    const hasContent = await page.locator("main").first().isVisible().catch(() => false);
    expect(hasContent).toBe(true);
  });
});
