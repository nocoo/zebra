# C3 — Worker scheduled handler + RPC + KV writes

## Scope

Wire the C1 sync core into the Cloudflare Worker runtime. Adds:

- A `scheduled` handler that runs daily, fetches OpenRouter + models.dev, merges with bundled baseline + admin D1 rows, and writes results to KV.
- Two read-only RPC methods (`pricing.getDynamicPricing`, `pricing.getDynamicPricingMeta`) that the web app will call in C4.
- The wrangler cron trigger.
- Worker-side import of `model-prices.json` so cold start always has data.

Existing `pricing.listModelPricing` RPC and the `pricing:all` cache stay untouched. The web app and `lib/pricing.ts` are still not modified — C3 only **publishes** dynamic pricing; nothing reads it from the cost path until C5.

## Files added

```
packages/worker-read/src/sync/
├── orchestrator.ts                          # syncDynamicPricing(env, now): runs full pipeline
├── orchestrator.test.ts
├── kv-store.ts                              # readDynamic(env), writeDynamic(env, ...), readMeta, writeMeta
├── kv-store.test.ts
└── admin-loader.ts                          # loadAdminRows(env): SELECT from model_pricing → AdminPricingRow[]
    admin-loader.test.ts
```

## Files modified

```
packages/worker-read/src/index.ts            # import scheduled handler; register pricing.getDynamic* RPC routes
packages/worker-read/src/rpc/pricing.ts      # add 2 new RPC methods (getDynamicPricing, getDynamicPricingMeta)
packages/worker-read/src/rpc/pricing.test.ts # tests for new methods
packages/worker-read/wrangler.toml           # add [triggers] crons = ["0 3 * * *"] (root + env.test)
```

No other file touched.

## Module contracts

### `sync/kv-store.ts`

```typescript
const KEY_DYNAMIC = "pricing:dynamic";
const KEY_DYNAMIC_META = "pricing:dynamic:meta";
const KEY_LAST_FETCH = "pricing:last-fetch";   // raw upstream JSON, used by admin rebuild path (C6)

export async function readDynamic(env: Env): Promise<DynamicPricingEntry[] | null>;
export async function writeDynamic(env: Env, entries: DynamicPricingEntry[]): Promise<void>;
export async function readMeta(env: Env): Promise<DynamicPricingMeta | null>;
export async function writeMeta(env: Env, meta: DynamicPricingMeta): Promise<void>;
export async function readLastFetch(env: Env): Promise<{ openRouter: unknown; modelsDev: unknown } | null>;
export async function writeLastFetch(env: Env, payload: { openRouter: unknown; modelsDev: unknown }): Promise<void>;
```

- All values stored as JSON strings; no per-key TTL (we judge freshness by `meta.lastSyncedAt`).
- `read*` returns `null` on KV miss or parse error (logged, not thrown).
- `writeLastFetch` size guard: skip if serialized payload exceeds 24 MB (KV per-value limit is 25 MB; leave headroom).

### `sync/admin-loader.ts`

```typescript
export async function loadAdminRows(env: Env): Promise<AdminPricingRow[]>;
```

Runs `SELECT model, source, input, output, cached FROM model_pricing` against `env.DB`. Maps each row to the `AdminPricingRow` shape from `sync/types.ts` (defined in C1). Returns `[]` on query error (logged) — admin overlay is best-effort, not a blocker for sync.

### `sync/orchestrator.ts`

```typescript
export interface SyncOutcome {
  ok: boolean;
  entriesWritten: number;
  meta: DynamicPricingMeta;
  warnings: string[];
  errors: Array<{ source: 'openrouter' | 'models.dev' | 'd1' | 'kv'; message: string }>;
}

export async function syncDynamicPricing(
  env: Env,
  now: string,
  options?: { forceRefetch?: boolean }
): Promise<SyncOutcome>;
```

Pipeline:

1. **Load baseline** — `import baseline from '../data/model-prices.json'`. Always available; bundled at build time.
2. **Fetch upstream in parallel**:
   - `fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(20_000) })`
   - `fetch('https://models.dev/api.json', { signal: AbortSignal.timeout(20_000) })`
   - **Partial-success policy** (intentionally distinct from C2): if exactly one source fails, log it in `errors`, parse the other normally, and feed `[]` for the failed source into merge. The bundled baseline + the surviving source still produce a usable result. If both fail, fall through to step 3 with the cached `pricing:last-fetch` payload (if present).
3. **Cache last-fetch** — when both succeed, write the raw JSON to `pricing:last-fetch` for use by C6's admin invalidation path (synchronous rebuild without re-hitting upstream).
4. **Parse** with C1's `parseOpenRouter(json, now)` / `parseModelsDev(json, now)`; collect warnings.
5. **Load admin rows** with `loadAdminRows(env)`.
6. **Merge** with C1's `mergePricingSources({ baseline, openRouter, modelsDev, admin, now })`.
7. **Write KV**:
   - `writeDynamic(env, entries)`
   - `writeMeta(env, meta)` where `meta` is built from `mergeResult.meta` plus `lastError` populated from `errors[0]?.message ?? null`.
8. Return `SyncOutcome` with `ok = errors.length === 0` (so a partial success still reports `ok: false` but with `entriesWritten > 0` — the operator sees the breakage even though users get fresh data).

`syncDynamicPricing` is the **single entry point** used by both the cron path (C3) and the admin invalidation rebuild (C6). Composing them through one function eliminates drift.

### `index.ts` registration

Add a top-level export:

```typescript
export default {
  fetch: async (request, env, ctx) => { /* existing */ },
  scheduled: async (event, env, ctx) => {
    const now = new Date().toISOString();
    const outcome = await syncDynamicPricing(env, now);
    if (!outcome.ok) console.error("dynamic pricing sync degraded", outcome.errors);
    else console.log("dynamic pricing sync ok", { entries: outcome.entriesWritten });
  },
};
```

`scheduled` does NOT call `ctx.waitUntil` — the platform already waits for the returned promise.

### `rpc/pricing.ts` additions

Two new methods, alongside the existing three:

```typescript
export interface GetDynamicPricingRequest {
  method: "pricing.getDynamicPricing";
}

export interface GetDynamicPricingMetaRequest {
  method: "pricing.getDynamicPricingMeta";
}
```

Handlers:

- `pricing.getDynamicPricing` → `readDynamic(env)`; on null, return the bundled baseline import (deterministic cold-start fallback). Always wraps the array in `{ entries, source: 'kv' | 'baseline' }` so callers can surface a "fallback active" badge in the dashboard.
- `pricing.getDynamicPricingMeta` → `readMeta(env)`; on null, synthesize `{ lastSyncedAt: '1970-01-01T00:00:00.000Z', modelCount: baseline.length, baselineCount: baseline.length, openRouterCount: 0, modelsDevCount: 0, adminOverrideCount: 0, lastError: { at: now, message: 'KV empty (cold start)' } }`. Synthetic meta is clearly distinguishable.

Both methods are **read-only**; they never trigger sync. Sync only happens on cron or via C6's admin endpoint.

### `wrangler.toml`

Add to root:
```toml
[triggers]
crons = ["0 3 * * *"]   # daily 03:00 UTC
```

Mirror under `[env.test]` so the test deployment has the same shape (we do not actually want tests firing real cron, but having the binding declared keeps `wrangler deploy --env test` parity-correct):
```toml
[env.test.triggers]
crons = ["0 3 * * *"]
```

CI does not deploy; this is purely declarative.

## Tests

### `sync/kv-store.test.ts`

- `read*` returns null on KV miss.
- `read*` returns null on malformed JSON (and logs).
- `write*` round-trips through a Miniflare-style in-memory KV (use `@cloudflare/workers-types` test helpers already present in repo).
- `writeLastFetch` skips when payload exceeds 24 MB; logs a warning.

### `sync/admin-loader.test.ts`

- Empty table → `[]`.
- Mixed rows (some `source = null`, some `source = 'codex'`) → mapped fields correct.
- D1 throws → returns `[]`, logs error.

### `sync/orchestrator.test.ts`

- Both upstream succeed → `ok: true`, `entriesWritten > 0`, `errors === []`, KV written, `last-fetch` cached.
- OpenRouter 500 → `ok: false`, models.dev still parsed, baseline preserved, KV still written with degraded set.
- Both upstream fail → uses `pricing:last-fetch` cache; `ok: false`; KV still written.
- Both upstream fail AND no `last-fetch` cache → uses bundled baseline only; `ok: false`; entries === baseline.length.
- Admin rows applied: source=null overrides entry; source='codex' contributes to `meta.adminOverrideCount` only (per C1 rule, no entries change).
- `meta.lastError` populated from first error; cleared when next sync succeeds.

### `rpc/pricing.test.ts` additions

- `pricing.getDynamicPricing` returns `{ entries: [...], source: 'kv' }` when KV populated.
- `pricing.getDynamicPricing` returns `{ entries: <baseline>, source: 'baseline' }` on KV miss.
- `pricing.getDynamicPricingMeta` returns synthesized cold-start meta on KV miss.
- Existing `pricing.listModelPricing` test stays green (no behavior change).

### Existing tests

- `pricing.test.ts` — all prior assertions stay green.
- `index.test.ts` — must add a smoke test that `scheduled` exists on the default export and is callable with a stub env.

## Idempotency / observability

- Cron firing twice in the same minute (rare CF retry) is safe: the merge is deterministic for the same inputs, and KV writes are last-write-wins with identical content → zero-diff.
- `console.log` / `console.error` lines are tagged with the literal prefix `dynamic pricing sync ` so they're greppable in `wrangler tail`.
- No metrics emission in C3 — operator visibility comes from the `/pricing` page (C4) showing `meta.lastSyncedAt` and `meta.lastError`.

## Conventions followed

- New RPC methods follow the existing `pricing.*` naming and live in the same handler file, registered through the existing `handlePricingRpc` switch.
- KV keys use the documented `pricing:dynamic` / `pricing:dynamic:meta` strings — no environment prefix (the test/prod split is by namespace ID, not key prefix).
- Imports of `model-prices.json` use the worker-read tsconfig's existing `resolveJsonModule` (already enabled).
- Tests follow `vitest` + `@cloudflare/workers-types` mocking pattern already in `cache.test.ts`.

## What this commit does NOT do

- Does not modify `packages/web/**` — no new API route, no UI.
- Does not touch `lib/pricing.ts`, `estimateCost`, or any cost calculation.
- Does not invalidate or rebuild on admin writes — C6 covers that.
- Does not add a manual "sync now" admin button — C6 wires it.
- Does not alter `pricing:all` or `pricing.listModelPricing` (they belong to admin CRUD list and stay independent).

## Acceptance

- `bun run --filter @pew/worker-read test` green (new + old).
- `bun run --filter @pew/worker-read typecheck` green.
- `bun run lint` green.
- `wrangler dev --local` boots; `curl -X POST /api/rpc -d '{"method":"pricing.getDynamicPricing"}'` returns the bundled baseline.
- `wrangler dev --local --test-scheduled` then `curl /__scheduled?cron=0+3+*+*+*` writes KV; subsequent `getDynamicPricing` returns `source: 'kv'`.
- `bun test` whole-repo green; existing web/cli tests untouched.
