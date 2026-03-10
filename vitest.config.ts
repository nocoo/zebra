import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "packages/web/src"),
      "@pew/core": resolve(__dirname, "packages/core/src/index.ts"),
    },
  },
  test: {
    globals: true,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/__tests__/e2e/**",
      "**/e2e/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["packages/*/src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/index.ts",
        "**/bin.ts",
        "**/cli.ts",
        "**/types.ts",
        // bun:sqlite adapter — untestable in vitest (Node runtime).
        // All logic is exercised through DI in sync.test.ts / session-sync.test.ts.
        "**/opencode-sqlite-db.ts",
        // NextAuth catch-all route — pure re-export, no custom logic.
        "**/\\[...nextauth\\]/route.ts",
        // ---------------------------------------------------------------------------
        // TSX files — UI components, pages, and layouts.
        //
        // All business logic from tsx files has been extracted into testable
        // lib/*.ts modules (cost-helpers, date-helpers, usage-helpers, etc.).
        // The remaining tsx files are purely presentational React components
        // (JSX layout, Recharts wrappers, shadcn/ui primitives, page shells)
        // that belong in E2E / visual regression tests, not unit tests.
        // ---------------------------------------------------------------------------
        "**/*.tsx",
      ],
      thresholds: {
        statements: 90,
        branches: 90,
        functions: 90,
        lines: 90,
      },
    },
  },
});
