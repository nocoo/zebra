# pew

Show your tokens — the contribution graph for AI-native developers.

## Testing & Git Hooks

### Prerequisites

- [Bun](https://bun.sh/) (package manager + runtime)
- Run `bun install` at the repo root — this triggers `husky` via the `prepare` script, which sets up git hooks automatically.

### Test & Lint Scripts

| Script | What it does |
|--------|-------------|
| `bun run test` | Run all unit tests (Vitest) |
| `bun run test:coverage` | Run unit tests with V8 coverage — fails if below 90% threshold |
| `bun run test:watch` | Run tests in watch mode |
| `bun run lint` | Full lint: TypeScript strict type check (4 packages) + ESLint |
| `bun run lint:typecheck` | TypeScript type check only (no ESLint) |
| `bun run test:e2e` | L3 API E2E tests (starts server on port 17030) |
| `bun run test:e2e:ui` | L4 BDD E2E tests via Playwright (port 27030) |

### Git Hooks (Husky v9)

Hooks are checked into `.husky/` and shared across the team. After `bun install`, they activate automatically.

| Hook | Runs | Purpose |
|------|------|---------|
| **pre-commit** | `bun run test:coverage` | Unit tests + 90% coverage threshold. Blocks commit on failure. |
| **pre-push** | `bun run test:coverage` → `bun run lint` → `bun run test:e2e` | Full quality gate: UT + coverage + TypeScript + ESLint + API E2E. Catches issues from remote merges that bypassed pre-commit. |

### Coverage Policy

- **Target: 90%** on statements, branches, functions, and lines.
- Coverage thresholds are enforced in `vitest.config.ts` and checked on every commit.
- Modules that are impractical to unit test (React hooks, NextAuth config, middleware, Cloudflare R2 client) are excluded from coverage and covered by E2E tests instead.
- If a module is hard to test, prefer extracting testable logic into pure functions rather than lowering the threshold.

### Lint Policy

- **Zero errors, zero warnings** enforced.
- TypeScript: `strict: true` + `noUnusedLocals` + `noUnusedParameters` across all packages.
- ESLint: `typescript-eslint/strict` + `react-hooks/recommended` + `@next/next/recommended`.
- Individual cases may be suppressed with `eslint-disable-next-line` when justified (with a comment explaining why).
