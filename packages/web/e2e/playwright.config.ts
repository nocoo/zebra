import { defineConfig } from "@playwright/test";

const E2E_UI_PORT = process.env.E2E_UI_PORT || "27020";

export default defineConfig({
  testDir: ".",
  timeout: 60_000, // Increased for CI environment
  retries: process.env.CI ? 2 : 0, // Retry twice in CI for flaky network issues
  workers: 1, // Serial execution to reduce server load
  use: {
    baseURL: `http://localhost:${E2E_UI_PORT}`,
    headless: true,
    // Increase navigation timeout for CI
    navigationTimeout: 30_000,
  },
  // No webServer — scripts/run-e2e-ui.ts manages the dev server lifecycle.
});
