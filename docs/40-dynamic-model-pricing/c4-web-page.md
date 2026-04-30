# C4 — Web read API + `/pricing` dashboard page

## Scope

Expose the dynamic pricing data published by C3 to the web app, and add a sortable/filterable dashboard page for it. The cost calculation path stays on the existing static `lib/pricing.ts` — C5 is the cutover. C4 only **publishes a new view**; existing `/api/pricing` and all charts continue to work unchanged.

## Files added

```
packages/web/src/app/api/pricing/models/
└── route.ts                                          # GET → { entries, meta, servedFrom }

packages/web/src/app/api/pricing/models/
└── route.test.ts                                     # auth + RPC delegation + error fallback

packages/web/src/app/(dashboard)/pricing/
├── page.tsx                                          # server component shell
├── pricing-table.tsx                                 # client component: sort/filter/search
├── pricing-meta-banner.tsx                           # client component: meta + lastErrors[] surface
└── __tests__/
    ├── pricing-table.test.tsx
    └── pricing-meta-banner.test.tsx

packages/web/src/lib/
└── dynamic-pricing-types.ts                          # re-export of DynamicPricingEntry/Meta from worker-read
```

## Files modified

```
packages/web/src/lib/db-worker.ts                     # add getDynamicPricing(), getDynamicPricingMeta() RPC wrappers
packages/web/src/components/sidebar.tsx               # (or wherever nav lives) add /pricing link, admin-only
```

No edits to existing routes, charts, `lib/pricing.ts`, or any cost calculation.

## Module contracts

### `app/api/pricing/models/route.ts`

```typescript
export async function GET(request: Request): Promise<Response>;
```

Behavior:

1. **Auth gate**: resolve user via `resolveUser(request)`. If not logged in → 401. If user is not admin → 403. (The `/pricing` page is admin-only in C4; if product later wants it on the public dashboard, drop the admin check then.)
2. **Fetch**:
   - `entries = await db.getDynamicPricing()` (returns `{ entries, servedFrom }`)
   - `meta = await db.getDynamicPricingMeta()`
   - Both via the existing `getDbRead()` worker-read client.
3. **Return** `NextResponse.json({ entries: entries.entries, servedFrom: entries.servedFrom, meta }, { headers: { 'cache-control': 'private, max-age=60' } })`. 60 s edge cache is enough — the underlying KV updates daily.
4. **Error fallback**: if either RPC throws (worker-read unreachable), return 503 with `{ error, fallback: { entries: [], meta: null } }`. Page must render the error state without crashing.

This route does **not** import `lib/pricing.ts` — it's strictly the dynamic dataset, separate from the cost-calc `PricingMap` served by `/api/pricing`.

### `lib/db-worker.ts` additions

```typescript
async getDynamicPricing(): Promise<{ entries: DynamicPricingEntry[]; servedFrom: 'kv' | 'baseline' }>;
async getDynamicPricingMeta(): Promise<DynamicPricingMeta>;
```

Implemented as thin RPC wrappers, mirroring the existing `listModelPricing()` pattern. Types imported from the new `lib/dynamic-pricing-types.ts` (which re-exports from `@pew/worker-read/src/sync/types`). The re-export indirection means future type tweaks happen in one place.

### `app/(dashboard)/pricing/page.tsx`

Server component:

```typescript
export default async function PricingPage() {
  const me = await getCurrentUser();
  if (!me?.isAdmin) redirect('/dashboard');

  const data = await fetchPricingModels();   // hits /api/pricing/models internally
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Model Pricing</h1>
      <PricingMetaBanner meta={data.meta} servedFrom={data.servedFrom} />
      <PricingTable entries={data.entries} />
    </div>
  );
}
```

Server-side `fetchPricingModels()` calls the same worker-read RPCs directly (no internal HTTP roundtrip) for SSR speed. The `/api/pricing/models` route exists for client-side refresh and any future external integrations.

### `pricing-meta-banner.tsx` (client)

Renders:
- `lastSyncedAt` as relative time + absolute UTC tooltip.
- Stale warning (yellow) when `lastSyncedAt > 36h ago`; danger (red) when `> 7d ago`.
- `servedFrom: 'baseline'` → orange banner: "Showing bundled baseline — KV cache is empty (cold start) or worker-read is unreachable."
- `lastErrors[]`: one line per source. Each line is `[source] message — at <time>`. Empty/null → no row.
- Origin counts: `baseline N · openrouter N · models.dev N · admin N` as a small footer chip row.

No write actions in C4 — the "Force sync now" button arrives in C6.

### `pricing-table.tsx` (client)

Columns:
| Model | Provider | Display name | Input | Output | Cached | Context | Origin | Updated |

Features:
- Sort by any column (default: provider asc, model asc).
- Filter input: case-insensitive substring match on model + displayName + provider.
- Origin column rendered as a colored chip per the main design doc (baseline=gray, models.dev=green, openrouter=blue, admin=purple).
- Aliases shown in a hover tooltip on the model cell.
- Numeric columns right-aligned; null cached/context shown as "—".
- Empty state when entries array is empty: "No pricing data available — check the meta banner for sync status."

Pure presentation; no data fetching. Receives `entries` as a prop.

## Tests

### `route.test.ts`

```typescript
test('401 when unauthenticated')
test('403 when authenticated but not admin')
test('returns entries + meta + servedFrom for admin')
test('503 with fallback shape when worker-read throws')
test('60s cache-control header')
```

Mocks `getDbRead()` to return canned data; no real worker-read.

### `pricing-table.test.tsx`

```typescript
test('renders one row per entry')
test('default sort: [provider, model]')
test('clicking column header toggles sort direction')
test('filter input narrows rows by model substring (case-insensitive)')
test('origin chip color matches origin')
test('null context renders as em dash, not "null"')
test('aliases visible in tooltip')
```

### `pricing-meta-banner.test.tsx`

```typescript
test('relative time renders for fresh sync')
test('yellow stale warning when lastSyncedAt is 40h ago')
test('red stale warning when lastSyncedAt is 8d ago')
test('servedFrom=baseline shows orange fallback banner')
test('lastErrors[] renders one row per error with source label')
test('null lastErrors renders nothing')
```

### Existing tests

`/api/pricing/route.test.ts` (if present) and all cost-calc unit tests stay green — C4 makes zero behavioral changes to the existing path.

## Conventions followed

- Page lives under `(dashboard)` route group and inherits the dashboard layout.
- Server / client component split mirrors existing pages like `(dashboard)/sessions/page.tsx`.
- RPC method names in `db-worker.ts` match the worker-side names exactly (`getDynamicPricing`, `getDynamicPricingMeta`).
- Tests use vitest + `@testing-library/react` per repo norm.
- Type re-export pattern (`lib/dynamic-pricing-types.ts`) follows the existing `lib/rpc-types.ts` precedent.

## What this commit does NOT do

- Does not change `/api/pricing` or `lib/pricing.ts`.
- Does not change any cost calculation, chart, or summary.
- Does not add a "Force sync now" button (C6).
- Does not add edit/admin write actions on the page (admin CRUD lives in the existing admin section).
- Does not modify worker-read.

## Acceptance

- `bun run --filter @pew/web typecheck` green.
- `bun run --filter @pew/web test` green (new + old).
- `bun run lint` green.
- `bun run dev`, log in as admin, visit `/pricing`:
  - Table renders all entries.
  - Meta banner shows `lastSyncedAt`.
  - When worker-read KV is empty, banner shows orange `servedFrom=baseline` notice and table shows the bundled baseline rows.
  - Filter + sort work without page reload.
- Non-admin user visiting `/pricing` is redirected to `/dashboard`.
- Existing `/dashboard` charts and cost summaries render identical numbers as before C4.
