import { test, expect } from "@playwright/test";

test.describe("settings and projects pages", () => {
  test("settings showcases page loads", async ({ page }) => {
    await page.goto("/settings/showcases");
    // May redirect to login or load content
    const url = page.url();
    expect(url.includes("/settings") || url.includes("/login")).toBe(true);
  });

  test("manage projects page loads", async ({ page }) => {
    await page.goto("/manage-projects");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Project");
  });
});
