import { test, expect } from "@playwright/test";

test.describe("data pages", () => {
  test("agents page loads", async ({ page }) => {
    await page.goto("/agents");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Agent");
  });

  test("models page loads", async ({ page }) => {
    await page.goto("/models");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Model");
  });

  test("projects page loads", async ({ page }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Project");
  });

  test("sessions page loads", async ({ page }) => {
    await page.goto("/sessions");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Session");
  });

  test("daily usage page loads", async ({ page }) => {
    await page.goto("/daily-usage");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Daily");
  });

  test("hourly usage page loads", async ({ page }) => {
    await page.goto("/hourly-usage");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Hourly");
  });
});
