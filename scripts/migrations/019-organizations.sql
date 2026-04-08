-- ============================================================
-- Organizations
-- ============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id          TEXT PRIMARY KEY,           -- UUID
  name        TEXT NOT NULL,              -- Display name, e.g. "Anthropic"
  slug        TEXT NOT NULL UNIQUE,       -- URL-safe, e.g. "anthropic"
  logo_url    TEXT,                       -- Stable R2 public URL (not presigned)
  created_by  TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_org_slug ON organizations(slug);

-- ============================================================
-- Organization memberships (many-to-many)
-- ============================================================

CREATE TABLE IF NOT EXISTS organization_members (
  id        TEXT PRIMARY KEY,             -- UUID
  org_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
