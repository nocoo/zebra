# Projects Page — Project Label Management

> Dashboard feature allowing users to assign human-readable labels to
> anonymized project references (`project_ref`) collected from AI coding tools.

## Overview

### Problem

Each AI tool generates `project_ref` differently:

| Tool | Raw Source | Hashed by | `project_ref` Format |
|------|-----------|-----------|---------------------|
| Claude Code | Path-encoded dir name in `~/.claude/projects/` | **Pew** — `SHA-256(dirName)[0:12]` | `a1b2c3d4e5f6` |
| Codex | `session_meta.payload.cwd` (absolute path) | **Pew** — `SHA-256(cwd)[0:12]` | `a1b2c3d4e5f6` |
| Gemini CLI | `projectHash` field in session JSON | **Gemini CLI** (pre-hashed) | opaque string |
| OpenCode (SQLite) | `session.project_id` column (SHA-1) | **OpenCode** (pre-hashed) | 40-char hex |
| OpenCode (JSON) | None — legacy data before 2026-02-15 | N/A | `null` |
| OpenClaw | Agent name from `~/.openclaw/agents/{name}/` | None — stored as-is | `my-agent` |

These raw values are meaningless to users. A user working on "pew" across
different tools will see multiple unrelated-looking hashes.

> **Note on Claude Code encoding**: Claude stores projects under directory
> names like `-Users-nocoo-workspace-personal-pew` (path with `/` and `.`
> replaced by `-`). This encoding is **not reversible** (cannot distinguish
> original `-`, `.`, and `/`), so Pew hashes the directory name itself rather
> than attempting to reconstruct the absolute path. This means Claude Code and
> Codex working on the same directory will produce **different** `project_ref`
> values — users can merge them via the label system.

### Solution

A new `project_labels` table allows users to map `project_ref` → human-readable
label. Each user has independent labels (no sharing).

### Scope

- **In scope**: Dashboard page to view all `project_ref` values and assign labels
- **Out of scope**: Propagating labels to other pages (Sessions, etc.) — future work

---

## Database Schema

### Migration: `005-project-labels.sql`

```sql
CREATE TABLE IF NOT EXISTS project_labels (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id),
  project_ref TEXT NOT NULL,
  label       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, project_ref)
);

CREATE INDEX IF NOT EXISTS idx_project_labels_user
  ON project_labels(user_id);
```

### Constraints

- One label per `project_ref` per user
- `label` must be non-empty (validated at API layer)
- `project_ref` comes from `session_records.project_ref` (already NOT NULL filtered)

---

## API Design

### `GET /api/projects`

Returns all distinct `project_ref` values for the authenticated user,
with optional labels and aggregated stats.

**Query Parameters**: None (future: pagination)

**Response**:

```json
{
  "projects": [
    {
      "project_ref": "a1b2c3d4e5f6",
      "label": "pew",
      "sources": ["claude-code", "codex"],
      "session_count": 42,
      "last_active": "2026-03-10T08:00:00Z"
    },
    {
      "project_ref": "xyz789",
      "label": null,
      "sources": ["gemini-cli"],
      "session_count": 5,
      "last_active": "2026-03-09T12:00:00Z"
    }
  ]
}
```

**SQL**:

```sql
SELECT
  sr.project_ref,
  pl.label,
  GROUP_CONCAT(DISTINCT sr.source) AS sources,
  COUNT(*) AS session_count,
  MAX(sr.last_message_at) AS last_active
FROM session_records sr
LEFT JOIN project_labels pl
  ON pl.user_id = sr.user_id AND pl.project_ref = sr.project_ref
WHERE sr.user_id = ? AND sr.project_ref IS NOT NULL
GROUP BY sr.project_ref
ORDER BY last_active DESC
```

### `PATCH /api/projects`

Create or update a label for a `project_ref`.

**Request Body**:

```json
{
  "project_ref": "a1b2c3d4e5f6",
  "label": "pew"
}
```

**Validation**:

- `project_ref`: required, non-empty string
- `label`: required, non-empty string, max 100 chars

**SQL** (UPSERT):

```sql
INSERT INTO project_labels (user_id, project_ref, label, updated_at)
VALUES (?, ?, ?, datetime('now'))
ON CONFLICT (user_id, project_ref) DO UPDATE SET
  label = excluded.label,
  updated_at = datetime('now')
```

**Response**: Updated project row (same shape as GET)

### `DELETE /api/projects?project_ref=xxx`

Remove a label (keep `project_ref` in session_records, just unlink the label).

**Response**: `{ "success": true }`

---

## Frontend Design

### Navigation

Add "Projects" to the Settings group in sidebar.

**File**: `packages/web/src/lib/navigation.ts`

```typescript
// In BASE_NAV_GROUPS, Settings group
{ href: "/projects", label: "Projects", icon: "FolderKanban" },
```

**File**: `packages/web/src/components/layout/sidebar.tsx`

Add `FolderKanban` to `ICON_MAP`.

### Page: `(dashboard)/projects/page.tsx`

**Layout**: Match existing settings page pattern

- `"use client"` directive
- `<div className="max-w-3xl space-y-8">` wrapper
- Header with `<h1>` + `<p>` subtitle
- Table with inline editing

**Table Columns**:

| Column | Content | Interaction |
|--------|---------|-------------|
| Label | User-defined label or "Click to label" placeholder | Inline edit on click |
| Project Ref | Raw `project_ref` value | Read-only, monospace |
| Sources | Comma-separated list | Read-only |
| Sessions | Count | Read-only |
| Last Active | Relative time | Read-only |

**Inline Edit Behavior**:

1. Click label cell → becomes `<input>`
2. On blur or Enter → PATCH `/api/projects`
3. Show saving indicator during request
4. On success → revert to text display
5. On error → show toast, keep input focused

**Empty State**:

- If no projects: "No projects found. Sync your AI tools to see project data."

---

## File Changes Checklist

| File | Action | Description |
|------|--------|-------------|
| `scripts/migrations/005-project-labels.sql` | Create | D1 migration |
| `packages/web/src/lib/navigation.ts` | Edit | Add Projects nav item |
| `packages/web/src/components/layout/sidebar.tsx` | Edit | Add FolderKanban icon |
| `packages/web/src/app/api/projects/route.ts` | Create | GET + PATCH + DELETE |
| `packages/web/src/app/(dashboard)/projects/page.tsx` | Create | Projects page |
| `packages/web/src/hooks/use-projects.ts` | Create | SWR hook (optional) |

---

## Implementation Order

1. **Migration** — Create and apply `005-project-labels.sql`
2. **API** — Implement `/api/projects` route
3. **Navigation** — Add sidebar entry
4. **Page** — Build projects page with table
5. **Inline Edit** — Add label editing interaction
6. **Polish** — Empty state, loading states, error handling

---

## Future Considerations

- **Label propagation**: Show labels in Sessions page, usage breakdown
- **Project grouping**: Merge multiple `project_ref` values under one label
- **Color coding**: Assign colors to projects for visual distinction
- **Export**: Include project labels in CSV exports
