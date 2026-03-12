# By Device — Multi-Device Analytics & Management

> Two new dashboard pages for visualizing per-device usage (Analytics) and
> managing device aliases (Settings), building on the `device_id` column
> introduced in migration 006.

## Overview

### Problem

Since migration 006 (`scripts/migrations/006-device-id.sql`), each usage record
carries a `device_id` — a UUID generated once per CLI install
(`packages/cli/src/config/manager.ts:43`). However:

1. **No visibility** — All existing dashboard queries `GROUP BY hour_start, source, model`
   without `device_id` (`packages/web/src/app/api/usage/route.ts:128-131`).
   Users cannot see which device produced which tokens.
2. **No naming** — `device_id` is a raw UUID (`crypto.randomUUID()`). Users see
   `a3f8c2d1-...` instead of "MacBook Pro" or "Work Desktop".
3. **No management** — There is no device registry or metadata table. The only
   place `device_id` exists as structured data is the `usage_records` column.

### Solution: Two Pages, Separate Concerns

| Page | Sidebar Group | Route | Icon | Responsibility |
|------|--------------|-------|------|----------------|
| **By Device** | Analytics | `/devices` | `Monitor` | Read-only visualization: charts + summary table |
| **Devices** | Settings | `/manage-devices` | `MonitorSmartphone` | Device registry: list devices, set aliases |

This follows the existing pattern where analytical views live in the Analytics
group (By Agent at `/agents`, By Model at `/models`) while management pages live
in the Settings group (Projects at `/projects`, Teams at `/teams`).

---

## Current State

### Data Model

The `device_id` column in `usage_records`:

```sql
-- scripts/migrations/001-init.sql (squashed schema)
device_id TEXT NOT NULL DEFAULT 'default',
UNIQUE(user_id, device_id, source, model, hour_start)
```

- **Index**: `idx_usage_device(user_id, device_id)` — ready for per-device queries
- **Default**: `'default'` for backward compat (old CLIs that don't send device_id)
- **Generation**: `crypto.randomUUID()` in `ConfigManager.ensureDeviceId()`
  (`packages/cli/src/config/manager.ts:43-51`)
- **Persistence**: `~/.config/pew/config.json` → `deviceId` field
  (`packages/core/src/types.ts:284-289`)

### Types

| Type | Location | `device_id` field |
|------|----------|-------------------|
| `QueueRecord` | `packages/core/src/types.ts:171` | `device_id: string` (required) |
| `IngestRecord` | `packages/core/src/validation.ts:97` | `device_id?: string` (optional, backward compat) |
| `PewConfig` | `packages/core/src/types.ts:284` | `deviceId?: string` |

### Gaps

- **Zero API routes** expose `device_id` in responses
- **Zero dashboard queries** include `device_id` in `GROUP BY`
- **No device metadata table** — no alias/name storage
- **`session_records`** has no `device_id` column (only `usage_records` tracks devices)

---

## Database Changes

### Migration 007: `device_aliases`

```sql
-- scripts/migrations/007-device-aliases.sql
CREATE TABLE IF NOT EXISTS device_aliases (
  user_id    TEXT NOT NULL REFERENCES users(id),
  device_id  TEXT NOT NULL,
  alias      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, device_id)
);
```

Design notes:

- **Composite PK** `(user_id, device_id)` — no extra index needed, one alias per device per user
- **No foreign key to usage_records** — devices are discovered from usage data, not pre-registered
- **`alias` is NOT NULL** — if the row exists, it has a name. No row = no alias = show short UUID
- **Lightweight** — no device type, OS, hostname columns. Keep it simple, iterate later.

---

## API Changes

### `GET /api/usage/by-device`

New endpoint for the analytics page. Accepts `from`, `to` query parameters
(same convention as `/api/usage`).

Returns two datasets in a single response:

```typescript
interface ByDeviceResponse {
  /** Per-device aggregated stats */
  devices: Array<{
    device_id: string;
    alias: string | null;
    first_seen: string;         // MIN(hour_start)
    last_seen: string;          // MAX(hour_start)
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    reasoning_output_tokens: number;
    sources: string[];          // GROUP_CONCAT(DISTINCT source)
    models: string[];           // GROUP_CONCAT(DISTINCT model)
  }>;
  /** Daily timeline with device dimension */
  timeline: Array<{
    date: string;               // ISO date (YYYY-MM-DD)
    device_id: string;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
  }>;
}
```

SQL for `devices`:

```sql
SELECT
  ur.device_id,
  da.alias,
  MIN(ur.hour_start) AS first_seen,
  MAX(ur.hour_start) AS last_seen,
  SUM(ur.total_tokens) AS total_tokens,
  SUM(ur.input_tokens) AS input_tokens,
  SUM(ur.output_tokens) AS output_tokens,
  SUM(ur.cached_input_tokens) AS cached_input_tokens,
  SUM(ur.reasoning_output_tokens) AS reasoning_output_tokens,
  GROUP_CONCAT(DISTINCT ur.source) AS sources,
  GROUP_CONCAT(DISTINCT ur.model) AS models
FROM usage_records ur
LEFT JOIN device_aliases da
  ON da.user_id = ur.user_id AND da.device_id = ur.device_id
WHERE ur.user_id = ?
  AND ur.hour_start >= ?
  AND ur.hour_start < ?
GROUP BY ur.device_id
ORDER BY total_tokens DESC
```

SQL for `timeline`:

```sql
SELECT
  date(ur.hour_start) AS date,
  ur.device_id,
  SUM(ur.total_tokens) AS total_tokens,
  SUM(ur.input_tokens) AS input_tokens,
  SUM(ur.output_tokens) AS output_tokens,
  SUM(ur.cached_input_tokens) AS cached_input_tokens
FROM usage_records ur
WHERE ur.user_id = ?
  AND ur.hour_start >= ?
  AND ur.hour_start < ?
GROUP BY date(ur.hour_start), ur.device_id
ORDER BY date ASC
```

The existing `idx_usage_device(user_id, device_id)` index supports both queries.

### `GET /api/devices`

Management endpoint. Returns all devices the user has ever synced from, with
alias and summary stats.

```typescript
interface DevicesResponse {
  devices: Array<{
    device_id: string;
    alias: string | null;
    first_seen: string;
    last_seen: string;
    total_tokens: number;
    source_count: number;
    model_count: number;
  }>;
}
```

### `PUT /api/devices`

Update (upsert) a device alias.

```typescript
// Request body
interface UpdateDeviceRequest {
  device_id: string;
  alias: string;            // Non-empty, max 50 chars
}

// Response
interface UpdateDeviceResponse {
  success: true;
}
```

Implementation: `INSERT OR REPLACE INTO device_aliases (user_id, device_id, alias, updated_at) VALUES (?, ?, ?, datetime('now'))`

Validation:
- `device_id` must be a non-empty string
- `alias` must be 1-50 characters, trimmed
- `device_id` must exist in user's `usage_records` (prevent aliasing phantom devices)

---

## Frontend Changes

### Navigation (`packages/web/src/lib/navigation.ts`)

Add two sidebar entries:

```typescript
// Analytics group — after "By Model"
{ href: "/devices", label: "By Device", icon: "Monitor" },

// Settings group — after "Projects"
{ href: "/manage-devices", label: "Devices", icon: "MonitorSmartphone" },
```

Update `ROUTE_LABELS`:

```typescript
devices: "By Device",
"manage-devices": "Devices",
```

### Hooks

**`useDeviceData`** (`packages/web/src/hooks/use-device-data.ts`)
- Fetches `GET /api/usage/by-device?from=&to=`
- Returns `{ data, loading, error, refetch }`
- Same pattern as `useUsageData` (`packages/web/src/hooks/use-usage-data.ts`)

**`useDevices`** (`packages/web/src/hooks/use-devices.ts`)
- Fetches `GET /api/devices`
- Exposes `updateAlias(deviceId, alias)` → `PUT /api/devices`
- Refetches full list after mutation (same pattern as `useProjects`)

### Helpers (`packages/web/src/lib/device-helpers.ts`)

| Function | Purpose |
|----------|---------|
| `shortDeviceId(uuid)` | Returns first 8 chars of UUID |
| `deviceLabel(device)` | Returns `alias ?? shortDeviceId(device_id)` |
| `toDeviceTrendPoints(timeline, devices)` | Pivots timeline into `{ date, [deviceLabel]: tokens }[]` for LineChart |
| `toDeviceSharePoints(timeline, devices)` | Converts to percentage-based points for 100% stacked AreaChart |
| `groupByDevice(devices, pricingMap)` | Enriches device summaries with estimated cost |

### Chart Components

Three new components in `packages/web/src/components/dashboard/`:

**`DeviceTrendChart`** — Multi-line `LineChart`
- One line per device, colored from `CHART_COLORS` palette
- Interactive legend toggle (same as `SourceTrendChart` pattern)
- X-axis: date, Y-axis: total tokens
- Legend labels: `deviceLabel()` (alias or short UUID)

**`DeviceShareChart`** — 100% stacked `AreaChart`
- Shows each device's share of total usage over time
- Same pattern as `ModelEvolutionChart`
- Useful for spotting when a user shifts between devices

**`DeviceBreakdownChart`** — Horizontal stacked `BarChart`
- One bar per device, stacked segments: input / output / cached
- Same pattern as `ModelBreakdownChart`
- Sorted by total tokens descending

All use `DashboardResponsiveContainer` wrapper and `palette.ts` colors.

### Analytics Page: `/devices` (`packages/web/src/app/(dashboard)/devices/page.tsx`)

Structure follows the By Model page pattern (`packages/web/src/app/(dashboard)/models/page.tsx`):

```
┌──────────────────────────────────────────────────┐
│  By Device                        [Period: All ▾] │
│  Compare usage across your devices                │
├──────────────────────────────────────────────────┤
│  StatGrid:                                        │
│  [N Devices]  [Most Active: MacBook Pro]  [7d: 2] │
├──────────────────────────────────────────────────┤
│  ┌─ Device Trend ──────────┐ ┌─ Device Share ───┐ │
│  │  LineChart               │ │  AreaChart 100%   │ │
│  │  (multi-line per device) │ │  (share over time)│ │
│  └──────────────────────────┘ └──────────────────┘ │
├──────────────────────────────────────────────────┤
│  ┌─ Token Breakdown by Device ──────────────────┐ │
│  │  Horizontal stacked BarChart                  │ │
│  └───────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────┤
│  Summary Table (read-only):                       │
│  Device | Tools | Models | Input | Output |       │
│  Cached | Total | Est. Cost | Share               │
└──────────────────────────────────────────────────┘
```

- Period selector reuses `PeriodSelector` component
- Loading state: skeleton (reuse existing pattern)
- Empty state: "No device data. Sync from multiple devices to compare."
- Device labels: alias if set, otherwise short UUID (first 8 chars)

### Management Page: `/manage-devices` (`packages/web/src/app/(dashboard)/manage-devices/page.tsx`)

Structure follows the Projects page pattern (`packages/web/src/app/(dashboard)/projects/page.tsx`):

```
┌──────────────────────────────────────────────────┐
│  Devices                                          │
│  Manage your synced devices and set aliases       │
├──────────────────────────────────────────────────┤
│  DeviceCard:                                      │
│  ┌────────────────────────────────────────────┐   │
│  │  [MacBook Pro ✏️]              a3f8c2d1-... │   │
│  │  First seen: Mar 1 · Last seen: Mar 12     │   │
│  │  Tools: Claude Code, OpenCode              │   │
│  │  3 models · 1.2M tokens                    │   │
│  └────────────────────────────────────────────┘   │
│                                                   │
│  DeviceCard (no alias):                           │
│  ┌────────────────────────────────────────────┐   │
│  │  [Set a name... ✏️]            7b4e9f12-... │   │
│  │  First seen: Mar 5 · Last seen: Mar 11     │   │
│  │  Tools: Gemini CLI                         │   │
│  │  2 models · 500K tokens                    │   │
│  └────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────┤
│  ℹ Device IDs are auto-generated per machine      │
│    when you first run `pew sync`.                 │
└──────────────────────────────────────────────────┘
```

Interactions (all inline, no modals — matches Projects pattern):
- **Click alias** → inline text input, commits on blur/Enter → `PUT /api/devices`
- **No alias** → shows `shortDeviceId()` + placeholder "Set a name..."
- **No delete** — devices are auto-discovered from usage data, not user-created
- **Full refetch** after every mutation

---

## File Changes Summary

| Operation | Path |
|-----------|------|
| **New** | `scripts/migrations/007-device-aliases.sql` |
| **Edit** | `packages/core/src/types.ts` (add Device-related types) |
| **New** | `packages/web/src/app/api/usage/by-device/route.ts` |
| **New** | `packages/web/src/app/api/devices/route.ts` |
| **New** | `packages/web/src/hooks/use-device-data.ts` |
| **New** | `packages/web/src/hooks/use-devices.ts` |
| **New** | `packages/web/src/lib/device-helpers.ts` |
| **New** | `packages/web/src/components/dashboard/device-trend-chart.tsx` |
| **New** | `packages/web/src/components/dashboard/device-share-chart.tsx` |
| **New** | `packages/web/src/components/dashboard/device-breakdown-chart.tsx` |
| **New** | `packages/web/src/app/(dashboard)/devices/page.tsx` |
| **New** | `packages/web/src/app/(dashboard)/manage-devices/page.tsx` |
| **Edit** | `packages/web/src/lib/navigation.ts` (add 2 sidebar entries + route labels) |

Total: **11 new files + 2 edits**. No CLI or Worker changes required.

---

## Atomic Commits Plan

| # | Commit | Scope |
|---|--------|-------|
| 1 | `feat: add device_aliases migration` | `scripts/migrations/007-device-aliases.sql` |
| 2 | `feat: add device-related types to core` | `packages/core/src/types.ts` |
| 3 | `feat: add GET /api/usage/by-device endpoint` | API route |
| 4 | `feat: add GET/PUT /api/devices endpoint` | API route |
| 5 | `feat: add device data hooks and helpers` | hooks + lib |
| 6 | `feat: add device chart components` | 3 chart components |
| 7 | `feat: add By Device analytics page` | `/devices` page |
| 8 | `feat: add Devices management page` | `/manage-devices` page |
| 9 | `feat: add device entries to sidebar navigation` | `navigation.ts` |

---

## Out of Scope (Future Work)

- **Device-level session tracking** — `session_records` has no `device_id` column.
  Adding it would require a schema migration + CLI changes to include `device_id`
  in session snapshots. This is a separate effort.
- **Device deletion** — Users cannot remove stale devices. Could add a
  `DELETE /api/devices/:id` in the future to archive/hide old devices.
- **CLI `--device-name` flag** — Allow naming devices at sync time instead of
  in the dashboard. Requires CLI changes + API extension.
- **Hostname auto-detection** — Use `os.hostname()` as default alias suggestion
  when device is first seen. Requires CLI to send hostname alongside device_id.
