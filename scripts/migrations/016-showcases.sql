-- ============================================================
-- Showcases (user-submitted GitHub projects)
-- ============================================================

CREATE TABLE IF NOT EXISTS showcases (
  id              TEXT PRIMARY KEY,                         -- nanoid
  user_id         TEXT NOT NULL REFERENCES users(id),       -- submitter
  repo_key        TEXT NOT NULL,                            -- normalized: "owner/repo" lowercase
  github_url      TEXT NOT NULL,                            -- display URL (original casing)
  title           TEXT NOT NULL,                            -- fetched from GitHub
  description     TEXT,                                     -- fetched from GitHub
  tagline         TEXT,                                     -- user-provided recommendation (editable)
  og_image_url    TEXT,                                     -- GitHub OG image URL
  is_public       INTEGER NOT NULL DEFAULT 1,               -- 1=visible, 0=hidden
  refreshed_at    TEXT NOT NULL DEFAULT (datetime('now')),  -- last GitHub metadata sync
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(repo_key)                                          -- one submission per repo (normalized)
);

CREATE INDEX IF NOT EXISTS idx_showcases_user ON showcases(user_id);
CREATE INDEX IF NOT EXISTS idx_showcases_public_sort ON showcases(is_public, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_showcases_created ON showcases(created_at DESC);

-- ============================================================
-- Showcase Upvotes (one per user per showcase)
-- ============================================================

CREATE TABLE IF NOT EXISTS showcase_upvotes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  showcase_id  TEXT NOT NULL REFERENCES showcases(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(showcase_id, user_id)                              -- one upvote per user
);

CREATE INDEX IF NOT EXISTS idx_showcase_upvotes_showcase ON showcase_upvotes(showcase_id);
CREATE INDEX IF NOT EXISTS idx_showcase_upvotes_user ON showcase_upvotes(user_id);
