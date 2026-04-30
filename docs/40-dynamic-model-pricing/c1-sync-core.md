# C1 — Sync Core (pure functions + L1 tests)

## Scope

Add the **pure** parse/normalize/merge layer that both the cron-triggered sync (C3) and the local `sync-prices` script (C2) will consume. Nothing in this commit touches KV, D1, network, web, or any existing code path.

## Files added

```
packages/worker-read/src/sync/
├── types.ts              # DynamicPricingEntry / DynamicPricingMeta + helpers
├── openrouter.ts         # parseOpenRouter(json) -> DynamicPricingEntry[]
├── models-dev.ts         # parseModelsDev(json)  -> DynamicPricingEntry[]
└── merge.ts              # mergePricingSources({ baseline, openRouter, modelsDev, admin }) -> { entries, meta }

packages/worker-read/src/sync/__fixtures__/
├── openrouter.sample.json
└── models-dev.sample.json

packages/worker-read/src/sync/openrouter.test.ts
packages/worker-read/src/sync/models-dev.test.ts
packages/worker-read/src/sync/merge.test.ts
```

No changes to any existing file in this commit. No new exports from `index.ts`.

## Module contracts

### `types.ts`

```typescript
export interface DynamicPricingEntry {
  model: string;
  provider: string;
  displayName: string | null;
  inputPerMillion: number;
  outputPerMillion: number;
  cachedPerMillion: number | null;
  contextWindow: number | null;
  origin: 'baseline' | 'openrouter' | 'models.dev' | 'admin';
  updatedAt: string;       // ISO-8601
  aliases?: string[];
}

export interface DynamicPricingMeta {
  lastSyncedAt: string;
  modelCount: number;
  baselineCount: number;
  openRouterCount: number;
  modelsDevCount: number;
  adminOverrideCount: number;
  lastError?: { at: string; message: string } | null;
}

/** Admin override row consumed by merge. Mirrors model_pricing schema. */
export interface AdminPricingRow {
  model: string;
  source: string | null;     // usage/tool source — orthogonal to entry.origin
  input: number;
  output: number;
  cached: number | null;
}

export const PRICING_ORIGINS = ['baseline', 'openrouter', 'models.dev', 'admin'] as const;
```

`types.ts` exports types only — no runtime values besides the const array.

### `openrouter.ts`

```typescript
export interface OpenRouterApiResponse {
  data: Array<{
    id: string;                   // "anthropic/claude-sonnet-4"
    name?: string;
    context_length?: number | null;
    pricing: {
      prompt: string;             // per-token, decimal string
      completion: string;
      input_cache_read?: string;
    };
  }>;
}

export interface ParseResult {
  entries: DynamicPricingEntry[];
  warnings: string[];             // skipped entries with reason
}

/**
 * Parse OpenRouter `/api/v1/models` response into normalized entries.
 * - Multiplies per-token prices by 1_000_000 to get per-million.
 * - Skips entries whose prompt or completion price is non-finite or <0.
 * - Skips entries with empty id.
 * - Provider is the substring before the first "/"; "openai/gpt-4o" -> "openai" -> "OpenAI"
 *   via PROVIDER_DISPLAY (small lookup, unknown providers passed through capitalized).
 * - displayName is `name` with leading "<Provider>: " stripped.
 * - `now`: injected ISO-8601 timestamp for testability.
 */
export function parseOpenRouter(json: unknown, now: string): ParseResult;
```

### `models-dev.ts`

```typescript
export interface ModelsDevApiResponse {
  [providerId: string]: {
    models: {
      [modelId: string]: {
        name?: string;
        cost?: {
          input?: number;          // per-million
          output?: number;
          cache_read?: number;
        };
        limit?: { context?: number };
      };
    };
  };
}

export function parseModelsDev(json: unknown, now: string): ParseResult;
```

Provider mapping lives in this module:
```typescript
const PROVIDERS: Record<string, string> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  mistral: 'Mistral',
  xai: 'xAI',
  'github-copilot': 'GitHub Copilot',
  alibaba: 'Alibaba',
};
```
Unknown providers are skipped with a warning (we only ship pricing for providers we display).

### `merge.ts`

```typescript
export interface MergeInput {
  baseline: DynamicPricingEntry[];     // bundled JSON
  openRouter: DynamicPricingEntry[];
  modelsDev: DynamicPricingEntry[];
  admin: AdminPricingRow[];
  now: string;
}

export interface MergeResult {
  entries: DynamicPricingEntry[];      // final merged list, deterministic order
  meta: Omit<DynamicPricingMeta, 'lastSyncedAt' | 'lastError'> & { lastSyncedAt: string };
  warnings: string[];
}

export function mergePricingSources(input: MergeInput): MergeResult;
```

**Merge rules (apply in order):**

1. Start with `baseline` (origin stays `'baseline'`).
2. Apply `openRouter` on top:
   - For each entry, look up by canonical model ID.
   - If existing entry has non-zero prices and incoming has zero/null prices → **skip** (zero-price protection).
   - Otherwise replace (origin becomes `'openrouter'`).
3. Apply `modelsDev` on top with the same rules; replaces become `'models.dev'`.
4. Apply `admin` rows:
   - For `source = null`: overwrite the entry whose `model === row.model` (insert if absent). Origin → `'admin'`.
   - For `source != null`: this row affects `sourceDefaults[source]` and `models[model]` in the consumer (`buildPricingMap`). At the merge layer, we still want it represented in `entries`, so we add/replace the entry whose `model === row.model` and **also emit a synthetic per-source admin record** (see "Output shape" below).
5. **Alias expansion (last step)**: for each canonical entry whose ID contains `/`, compute the bare-name suffix; record it on `entry.aliases` only when no other entry already claims that bare name.

**Output shape:**
- `entries` — merged canonical list, sorted by `[provider, model]` for deterministic diffs and stable JSON output (essential for git-checked baseline).
- The synthetic per-source admin records are NOT placed in `entries`; instead `merge.ts` returns them on a side channel:

```typescript
export interface MergeResult {
  entries: DynamicPricingEntry[];
  sourceOverrides: Array<{
    source: string;
    pricing: { input: number; output: number; cached: number | null };
    model: string;            // the model that triggered this override (for traceability)
  }>;
  meta: ...;
  warnings: string[];
}
```

C5 (`buildPricingMap`) will consume both `entries` and `sourceOverrides`, mapping the latter to `PricingMap.sourceDefaults`. The merge layer doesn't know about `PricingMap` — it just reports what admin rows asked for, in a structure the consumer can apply.

**Counts in `meta`:**
- `baselineCount` / `openRouterCount` / `modelsDevCount` — number of entries whose final `origin` matches that source after merge (i.e. how many survived).
- `adminOverrideCount` — total admin rows applied (both `source=null` and `source!=null`).
- `modelCount` — `entries.length`.

## Tests

### `openrouter.test.ts`

Fixture covers:
- Valid Anthropic / OpenAI / Google entries.
- Entry with missing `name` (displayName falls back to ID-derived).
- Entry with `pricing.prompt = "0"` and `pricing.completion = "0"` (free tier; preserved as zero, NOT skipped — zero-price protection lives in merge, not parse).
- Entry with `pricing.prompt = "abc"` (invalid → skipped + warning).
- Entry with empty `id` (skipped).
- Entry with `context_length: null`.

Assertions:
- Per-token `1.5e-6` becomes `1.5` per million (multiplication).
- displayName "Anthropic: Claude Sonnet 4" becomes "Claude Sonnet 4".
- Provider "anthropic" maps to "Anthropic".
- `origin === 'openrouter'`, `updatedAt === now` for all entries.
- Warnings array contains expected skip reasons.

### `models-dev.test.ts`

Fixture covers:
- Multiple providers, each with multiple models.
- Model with missing `cost.cache_read` (cachedPerMillion = null).
- Model with missing `cost.input` (skipped + warning — can't compute cost without input price).
- Provider not in PROVIDERS map (skipped + warning).
- Model with `limit.context` missing (contextWindow = null).

### `merge.test.ts`

Cases:
1. **Baseline only** → entries unchanged; counts correct.
2. **Baseline + openRouter** → openRouter wins for overlapping IDs; baseline-only entries retained.
3. **Zero-price protection** → baseline has $3/$15; openRouter has $0/$0 → baseline retained, no warning needed (silent skip).
4. **modelsDev > openRouter** for overlapping IDs (modelsDev curated, higher priority).
5. **Admin source=null** → overwrites entry with origin='admin'; `sourceDefaults` empty.
6. **Admin source='codex'** → entry overwritten AND `sourceOverrides` contains `{source: 'codex', pricing, model}`.
7. **Alias expansion**:
   - `anthropic/claude-sonnet-4` and no other `claude-sonnet-4` → `aliases: ['claude-sonnet-4']`.
   - `anthropic/claude-3.5-sonnet` AND `bedrock/claude-3.5-sonnet` → no alias (collision).
8. **Deterministic order** — same input set, different array order in → identical output entries array (sorted).
9. **Counts** — meta values match origins of final `entries` plus admin row count.

## Conventions followed

- File header docstring matches existing worker-read style (`/** ... */` summary).
- All exports typed; no `any`.
- Pure functions take inputs + a `now` string; no `Date.now()` inside parse/merge (deterministic tests).
- Warnings collected; never thrown. Decision to fail/proceed lives in C3 orchestrator.
- Tests use `vitest` (matches existing `*.test.ts` in `packages/worker-read/src/rpc/`).

## What this commit does NOT do

- No fetch — `openrouter.ts` / `models-dev.ts` only parse already-fetched JSON.
- No KV writes, no D1 reads.
- No new RPC method, no `wrangler.toml` change, no `scheduled` handler.
- No web changes; `lib/pricing.ts` untouched.
- No registration in `worker-read/src/index.ts`.

## Acceptance

- `bun test packages/worker-read/src/sync/*.test.ts` green.
- `bun run --filter @pew/worker-read typecheck` green.
- `bun run lint` green.
- Existing `packages/worker-read/src/rpc/pricing.test.ts` and all other tests stay green (no behavior change).
