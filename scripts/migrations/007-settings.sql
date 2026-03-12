-- Migration 007: App-wide settings (key-value store).
--
-- Stores admin-configurable settings such as max team members.
-- Seed with default values.
--
-- Apply via: wrangler d1 execute pew-db --remote --file scripts/migrations/007-settings.sql

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default: max 5 members per team
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('max_team_members', '5');
