import { test, expect } from "@playwright/test";

test.describe("device pages", () => {
  test("devices page loads", async ({ page }) => {
    await page.goto("/devices");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Device");
  });

  test("manage devices page loads", async ({ page }) => {
    await page.goto("/manage-devices");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Device");
  });
});
