import { test, expect } from "@playwright/test";

test.describe("leaderboard pages", () => {
  test("main page loads", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });

  test("achievements page loads", async ({ page }) => {
    await page.goto("/leaderboard/achievements");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });

  test("agents page loads", async ({ page }) => {
    await page.goto("/leaderboard/agents");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });

  test("models page loads", async ({ page }) => {
    await page.goto("/leaderboard/models");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });

  test("showcases page loads", async ({ page }) => {
    await page.goto("/leaderboard/showcases");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });

  test("seasons page loads", async ({ page }) => {
    await page.goto("/leaderboard/seasons");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("pew");
  });
});
