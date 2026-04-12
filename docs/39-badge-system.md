# 39 — Badge System

> Admin-assigned badges that shine on the leaderboard — a 7-day spotlight for exceptional contributors.

## Overview

Badges are admin-created awards assigned to users. Unlike achievements (computed from data) or tier badges (computed from tokens), these are **manual, ephemeral rewards** that celebrate specific contributions or behaviors.

### Key Characteristics

| Aspect | Design |
|--------|--------|
| Creation | Admin-only, via `/admin/badges` |
| Assignment | Admin assigns badge to user, effective immediately |
| Duration | 7 days from assignment, auto-expires |
| Visibility | Leaderboard rank column, profile avatar area |
| Stacking | User can have multiple active badges |
| Re-assignment | Admin can re-assign same badge after expiry |
| History | All assignments preserved for audit |

### User Stories

1. **Admin creates badge**: "I want to create a badge with 1-3 characters that represents a specific honor"
2. **Admin assigns badge**: "I want to award this badge to a user for their contribution"
3. **User sees badge**: "I see my badge on the leaderboard instead of my rank number"
4. **Viewer sees badge**: "I see other users' badges in their profile popup"
5. **Auto-expiry**: "Badge disappears after 7 days without manual intervention"
6. **Admin re-assigns**: "I want to give the same badge again after it expired"

## Database Schema

### New Tables

```sql
-- scripts/migrations/0XX-badges.sql

-- ============================================================
-- Badge Definitions (admin-created templates)
-- ============================================================

CREATE TABLE IF NOT EXISTS badges (
  id              TEXT PRIMARY KEY,                         -- nanoid
  text            TEXT NOT NULL,                            -- 1-3 characters (e.g., "MVP", "神", "S1")
  shape           TEXT NOT NULL,                            -- shape key: "shield", "star", "hexagon", "circle", "diamond"
  color_bg        TEXT NOT NULL,                            -- background hex: "#3B82F6"
  color_text      TEXT NOT NULL,                            -- text hex: "#FFFFFF"
  description     TEXT,                                     -- admin notes (not shown to users)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_badges_created ON badges(created_at DESC);

-- ============================================================
-- Badge Assignments (user-badge links with expiry)
-- ============================================================

CREATE TABLE IF NOT EXISTS badge_assignments (
  id              TEXT PRIMARY KEY,                         -- nanoid
  badge_id        TEXT NOT NULL REFERENCES badges(id),
  user_id         TEXT NOT NULL REFERENCES users(id),
  assigned_at     TEXT NOT NULL DEFAULT (datetime('now')),  -- assignment timestamp
  expires_at      TEXT NOT NULL,                            -- assigned_at + 7 days
  assigned_by     TEXT NOT NULL REFERENCES users(id),       -- admin who assigned
  note            TEXT,                                     -- admin note for this assignment
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_badge_assignments_user ON badge_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_badge_assignments_badge ON badge_assignments(badge_id);
CREATE INDEX IF NOT EXISTS idx_badge_assignments_expires ON badge_assignments(expires_at);
CREATE INDEX IF NOT EXISTS idx_badge_assignments_active ON badge_assignments(user_id, expires_at);
```

### Schema Notes

- **No unique constraint on (badge_id, user_id)** — same badge can be assigned multiple times (history preserved)
- **`expires_at`** computed at assignment time: `datetime(assigned_at, '+7 days')`
- **`assigned_by`** tracks which admin made the assignment
- **`note`** allows admin to document why this assignment was made
- **Soft expiry** — no deletion, just filter by `expires_at > datetime('now')`

### Active Badge Query

```sql
-- Get user's active badges (for leaderboard/profile)
SELECT b.*, ba.assigned_at, ba.expires_at
FROM badge_assignments ba
JOIN badges b ON b.id = ba.badge_id
WHERE ba.user_id = ?
  AND ba.expires_at > datetime('now')
ORDER BY ba.assigned_at DESC;
```

## Badge Visual Design

### Shapes (5 presets)

```
Shield        Star          Hexagon       Circle        Diamond
  ___        *   *           ____           ___          /\
 /   \        \ /           /    \         /   \        /  \
|     |    *--   --*       /      \       |     |      <    >
|     |        |          |        |       \   /        \  /
 \___/        / \          \      /         ---          \/
              *             \____/
```

SVG components with consistent viewBox, badge text centered.

### Color Palettes (6 presets, randomly selected)

| Name | Background | Text | Use Case |
|------|------------|------|----------|
| Ocean | `#3B82F6` (blue-500) | `#FFFFFF` | General |
| Forest | `#22C55E` (green-500) | `#FFFFFF` | Growth |
| Sunset | `#F97316` (orange-500) | `#FFFFFF` | Energy |
| Royal | `#8B5CF6` (violet-500) | `#FFFFFF` | Premium |
| Crimson | `#EF4444` (red-500) | `#FFFFFF` | Urgent |
| Gold | `#EAB308` (yellow-500) | `#1F2937` | Champion |

All colors meet WCAG AA contrast requirements.

### Text Rules

- **Length**: 1-3 characters only (enforced in API + UI)
- **Font**: System UI bold, centered in shape
- **Size**: Responsive based on character count (1 char = larger, 3 chars = smaller)

### Badge Component

```tsx
// packages/web/src/components/badges/badge-icon.tsx

type BadgeShape = 'shield' | 'star' | 'hexagon' | 'circle' | 'diamond';

interface BadgeIconProps {
  text: string;           // 1-3 chars
  shape: BadgeShape;
  colorBg: string;        // hex
  colorText: string;      // hex
  size?: 'sm' | 'md' | 'lg';
}
```

## UI Integration

### 1. Leaderboard Row (Rank Position)

**Current**: `rank-badge.tsx` shows Trophy/Medal/Award icons for top 3, numbers for 4+.

**With badges**: If user has active badge(s), show **first badge** instead of rank indicator.

```
Before:                          After (with badge):
┌────┬────────┬──────────┐      ┌────┬────────┬──────────┐
│ 🏆 │ Alice  │ 1.2M     │      │ 🛡️ │ Alice  │ 1.2M     │
│ 🥈 │ Bob    │ 900K     │  →   │MVP │ Bob    │ 900K     │
│ 🥉 │ Carol  │ 800K     │      │ 🥉 │ Carol  │ 800K     │
│ 4  │ Dave   │ 700K     │      │ ⭐ │ Dave   │ 700K     │
└────┴────────┴──────────┘      │ S1│        │          │
                                └────┴────────┴──────────┘
```

**Logic priority**:
1. If user has active badge → show badge icon
2. Else if rank 1-3 → show trophy/medal/award icon
3. Else → show rank number

### 2. Profile Popup (Avatar Area)

**Location**: `profile-content.tsx`, next to avatar/name header.

**Display**: All active badges shown horizontally, size `sm`.

```
┌─────────────────────────────────┐
│  ┌────┐                         │
│  │    │  Bob Chen    MVP  ⭐     │
│  │ 🧑 │  @bobchen    ───  ──    │
│  └────┘              (badges)   │
│                                 │
│  Stats / Charts / etc.          │
└─────────────────────────────────┘
```

### 3. User Profile Page

If dedicated profile pages exist (e.g., `/u/[slug]`), badges appear in same avatar-adjacent position.

## Admin Interface

### Badge Management Page (`/admin/badges`)

Two sections:

#### Section 1: Badge Definitions

```
┌───────────────────────────────────────────────────────────┐
│ Badge Definitions                              [+ Create] │
├───────────────────────────────────────────────────────────┤
│ Preview │ Text │ Shape   │ Colors         │ Actions       │
│ ────────┼──────┼─────────┼────────────────┼───────────────│
│  🛡️MVP  │ MVP  │ Shield  │ Ocean          │ [Edit] [Del]  │
│  ⭐神   │ 神   │ Star    │ Gold           │ [Edit] [Del]  │
│  ⬡S1    │ S1   │ Hexagon │ Royal          │ [Edit] [Del]  │
└───────────────────────────────────────────────────────────┘
```

#### Section 2: Active Assignments

```
┌───────────────────────────────────────────────────────────┐
│ Active Assignments                            [+ Assign]  │
├───────────────────────────────────────────────────────────┤
│ Badge │ User       │ Assigned    │ Expires     │ Actions  │
│ ──────┼────────────┼─────────────┼─────────────┼──────────│
│ 🛡️MVP │ Bob Chen   │ 2026-04-10  │ 2026-04-17  │ [Revoke] │
│ ⭐神  │ Alice Wong │ 2026-04-08  │ 2026-04-15  │ [Revoke] │
└───────────────────────────────────────────────────────────┘
```

### Create Badge Dialog

```
┌─────────────────────────────────────┐
│ Create Badge                    [X] │
├─────────────────────────────────────┤
│                                     │
│ Text (1-3 chars):  [MVP____]        │
│                                     │
│ Shape:  ○ Shield  ○ Star  ○ Hex    │
│         ○ Circle  ○ Diamond         │
│         [Randomize]                 │
│                                     │
│ Color:  ○ Ocean   ○ Forest          │
│         ○ Sunset  ○ Royal           │
│         ○ Crimson ○ Gold            │
│         [Randomize]                 │
│                                     │
│ Preview:   ┌─────┐                  │
│            │ 🛡️  │                  │
│            │ MVP │                  │
│            └─────┘                  │
│                                     │
│ Description (optional):             │
│ [Season 1 MVP award_________]       │
│                                     │
│              [Cancel] [Create]      │
└─────────────────────────────────────┘
```

### Assign Badge Dialog

```
┌─────────────────────────────────────┐
│ Assign Badge                    [X] │
├─────────────────────────────────────┤
│                                     │
│ Badge:  [MVP 🛡️ ▼]                  │
│                                     │
│ User:   [Search user...___]         │
│         ┌─────────────────┐         │
│         │ Bob Chen        │         │
│         │ Alice Wong      │         │
│         └─────────────────┘         │
│                                     │
│ Note (optional):                    │
│ [Top contributor for Season 1__]    │
│                                     │
│ Duration: 7 days (fixed)            │
│ Expires:  2026-04-19                │
│                                     │
│              [Cancel] [Assign]      │
└─────────────────────────────────────┘
```

## API Routes

### Badge Definition CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/badges` | List all badge definitions |
| POST | `/api/admin/badges` | Create badge definition |
| PATCH | `/api/admin/badges/[id]` | Update badge definition |
| DELETE | `/api/admin/badges/[id]` | Delete badge definition |

### Badge Assignment

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/badges/assignments` | List all assignments (active + history) |
| POST | `/api/admin/badges/assignments` | Assign badge to user |
| DELETE | `/api/admin/badges/assignments/[id]` | Revoke assignment (soft: set expires_at = now) |

### Public Badge Query

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/users/[slug]/badges` | Get user's active badges |

### Leaderboard Integration

The existing leaderboard API (`/api/leaderboard`) will be extended to include active badges in the response:

```typescript
interface LeaderboardEntry {
  // ... existing fields
  badges?: Array<{
    id: string;
    text: string;
    shape: BadgeShape;
    colorBg: string;
    colorText: string;
  }>;
}
```

## Worker-Read RPC

Add new RPC handlers in `packages/worker-read`:

```typescript
// badges.get — get active badges for user(s)
// badges.list — admin: list all definitions
// badges.assignments — admin: list assignments with filters
```

## Implementation Phases

### Phase 1: Core Infrastructure

1. Database migration (`0XX-badges.sql`)
2. Worker-read RPC handlers
3. Badge icon component (`badge-icon.tsx`)
4. Type definitions in `@pew/core`

### Phase 2: Admin Interface

1. `/admin/badges` page with tabs (Definitions / Assignments)
2. Create/Edit badge dialog
3. Assign badge dialog with user search
4. Assignment list with revoke action

### Phase 3: Public Display

1. Leaderboard integration (replace rank with badge)
2. Profile popup badge display
3. Profile page badge display (if applicable)

### Phase 4: Polish

1. Badge assignment notifications (optional)
2. Badge history view for users (optional)
3. Expired badge indicators (optional)

## Security Considerations

- All badge management routes require admin auth
- Badge text sanitized (1-3 chars, alphanumeric + limited unicode)
- No HTML/script injection in badge text or description
- Rate limiting on assignment API to prevent spam

## Future Considerations

- **Custom duration**: Let admin specify expiry (1-30 days)
- **Badge categories**: Group badges by purpose (season awards, achievements, special events)
- **User-visible history**: "Past badges" section in profile
- **Notifications**: Email/in-app when badge assigned
- **Badge reactions**: Users can react to others' badges

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | 7-day fixed expiry | Simple UX, creates urgency, encourages re-engagement |
| 2 | Replace rank (not overlay) | Clean visual, rank can be inferred from position |
| 3 | First badge wins on leaderboard | Avoid visual clutter, most recent assignment shown |
| 4 | All badges shown in profile | Profile has more space, users want to show off |
| 5 | Preserve assignment history | Audit trail, re-assignment detection, future features |
| 6 | No cascading delete on badge | Prevent accidental loss of assignment history |
