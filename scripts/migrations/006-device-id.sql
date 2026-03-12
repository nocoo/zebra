-- Migration 006: Add device_id to usage_records for multi-device support.
--
-- Previously, the unique constraint (user_id, source, model, hour_start)
-- caused multi-device sync to overwrite data. Adding device_id makes each
-- device's records independent. Dashboard queries already use SUM() GROUP BY
-- without device_id, so they naturally aggregate across devices.
--
-- Backward compat: old CLI versions don't send device_id, so the column
-- defaults to 'default'. New CLI versions generate a UUID per install.
--
-- Apply via: wrangler d1 execute pew-db --remote --file scripts/migrations/006-device-id.sql

-- Step 1: Add the new column with a default value
ALTER TABLE usage_records ADD COLUMN device_id TEXT NOT NULL DEFAULT 'default';

-- Step 2: Drop the old unique constraint and create a new one.
-- SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table.
-- However, D1 supports dropping indexes. The UNIQUE constraint in SQLite
-- creates an implicit index. We'll use a unique index approach instead.

-- Drop the old unique index (SQLite creates an auto-index for UNIQUE constraints)
-- We can't drop the inline UNIQUE, but we can create a new unique index that
-- supersedes it. Actually, SQLite inline UNIQUE creates sqlite_autoindex_usage_records_1.
-- We cannot drop autoindexes. Instead, we'll recreate the table.

-- Recreate with the new constraint using the standard SQLite migration pattern:
CREATE TABLE usage_records_new (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id                 TEXT    NOT NULL REFERENCES users(id),
  source                  TEXT    NOT NULL,
  model                   TEXT    NOT NULL,
  hour_start              TEXT    NOT NULL,
  device_id               TEXT    NOT NULL DEFAULT 'default',
  input_tokens            INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens     INTEGER NOT NULL DEFAULT 0,
  output_tokens           INTEGER NOT NULL DEFAULT 0,
  reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens            INTEGER NOT NULL DEFAULT 0,
  created_at              TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, device_id, source, model, hour_start)
);

-- Copy existing data (device_id gets 'default' from the DEFAULT clause)
INSERT INTO usage_records_new
  (id, user_id, source, model, hour_start, device_id,
   input_tokens, cached_input_tokens, output_tokens,
   reasoning_output_tokens, total_tokens, created_at)
SELECT
  id, user_id, source, model, hour_start, 'default',
  input_tokens, cached_input_tokens, output_tokens,
  reasoning_output_tokens, total_tokens, created_at
FROM usage_records;

-- Swap tables
DROP TABLE usage_records;
ALTER TABLE usage_records_new RENAME TO usage_records;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_usage_user_time ON usage_records(user_id, hour_start);
CREATE INDEX IF NOT EXISTS idx_usage_source    ON usage_records(source);
CREATE INDEX IF NOT EXISTS idx_usage_device    ON usage_records(user_id, device_id);
