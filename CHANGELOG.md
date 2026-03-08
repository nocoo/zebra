# Changelog

## v0.3.0

### Features

- **Sidebar overhaul** — 3 collapsible NavGroups (Overview, Analytics, Account) using Radix Collapsible + CSS Grid animation; collapsed mode flattens to icon-only tooltipped buttons
- **Dashboard period selector** — "All Time / This Month / This Week" pill selector with dynamic stat cards and charts
- **Daily Usage page** — Usage trend chart, source + model filter dropdowns, monthly pagination with prev/next buttons
- **By Model page** — Added ModelBreakdownChart (horizontal stacked bar) above the detail table
- **`useUsageData` hook** — Now supports explicit `from`/`to` date params for flexible date range queries
- **D1 schema** — Added `nickname` column to `users`, created `teams` and `team_members` tables for upcoming team features

### Refactoring

- Renamed "Daily Details" → "Daily Usage" across sidebar and route labels
- Removed ModelBreakdownChart from dashboard (moved to dedicated By Model page)
- Sidebar rewritten from flat nav list to data-driven `NavGroup[]` architecture

### Infrastructure

- Test suite: 32 test files, 403 tests passing

## v0.2.0

### Breaking Changes

- **Project rename** — Renamed from "zebra" to "pew" across all packages, types, config paths, API key prefixes (`zk_` → `pk_`), and domains
- **CLI package** — Now published as `@nocoo/pew` (was `@nocoo/zebra`)
- **Config directory** — Moved from `~/.config/zebra/` to `~/.config/pew/`

### Features

- **Worker ingest** — Cloudflare Worker with native D1 bindings replaces REST API, reducing 60 sequential HTTP calls to a single batched request
- **CLI pre-aggregation** — Idempotent upload pipeline with multi-row INSERT and chunked batches (20 rows / 180 params)
- **429 retry** — CLI retries on rate limit with `Retry-After` header support
- **Dev mode** — `--dev` flag with separate `config.dev.json`, `DEFAULT_HOST`/`DEV_HOST` constants, and `resolveHost` helper
- **Sync improvements** — Files scanned per source in summary, directory-level mtime skip for OpenCode, batch size tuned to 50 for D1 Free plan limits
- **Logo assets** — Asset pipeline (`scripts/resize-logos.py`), file-based metadata icons, OpenGraph images in layout

### Fixes

- Exclude API routes from proxy matcher to allow Bearer token auth
- Pass env vars as Docker build args for Next.js page data collection
- Chunk ingest into 20-row batches to avoid D1 999-param limit
- Skip TLS verification in dev mode for mkcert certs

### Refactoring

- Remove standalone `upload` and `init` commands (merged into `sync`)
- Extract testable pure functions from `auth.ts` and `proxy.ts`
- Replace `--api` string flag with `--dev` boolean

### Infrastructure

- Cloudflare Worker workspace (`packages/worker`) with wrangler config
- Dockerfile for Railway deployment with Bun workspaces
- Test suite expanded: 32 test files, 400 tests passing

## v0.1.1

### Features

- **Dashboard** — Overview with stat cards, usage trend chart, source donut, model breakdown bar chart, and GitHub-style activity heatmap
- **Cost estimation** — Static pricing table with cache savings calculation
- **Public profiles** — `/u/:slug` pages with SEO metadata and full usage widgets
- **Leaderboard** — Public ranking by total tokens with week/month/all periods
- **CLI upload** — Auto-upload on sync with batch retry and offset tracking
- **CLI login** — Browser-based OAuth flow with API key storage

### Fixes

- Fix Google OAuth redirect using `localhost` instead of reverse proxy domain — added `trustHost: true` and secure cookie config
- Fix D1 batch sending array to REST API (no batch endpoint) — send individual queries in loop
- Add `pew.dev.hexly.ai` to `allowedDevOrigins`

### Infrastructure

- Auth.js v5 with Google OAuth, JWT strategy, and D1 adapter
- Cloudflare D1 HTTP API client
- Basalt design system foundation (3-tier luminance, chart colors, shadcn/ui primitives)
- Four-layer test architecture: 25 test files, 256 tests passing
- L3 API E2E tests for ingest, usage, and CLI auth endpoints

## v0.1.0

Initial development — monorepo skeleton, core types, CLI parsers (Claude Code, Gemini CLI, OpenCode, OpenClaw), SaaS backend with D1 storage.
