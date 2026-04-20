import { defineConfig } from "@playwright/test";

const E2E_UI_PORT = process.env.E2E_UI_PORT || "27020";

export default defineConfig({
  testDir: ".",
  timeout: 45_000, // 45s per test
  retries: process.env.CI ? 1 : 0, // Single retry in CI
  workers: process.env.CI ? 2 : 1, // 2 workers in CI, serial locally
  use: {
    baseURL: `http://localhost:${E2E_UI_PORT}`,
    headless: true,
    navigationTimeout: 20_000,
  },
  // No webServer — scripts/run-e2e-ui.ts manages the dev server lifecycle.
});
