-- Migration 021: Hash API keys at rest.
--
-- Previously the `users.api_key` column stored the plain key, so a database
-- compromise would leak every active CLI credential. This migration replaces
-- that column with `api_key_hash` (SHA-256 hex of the plain key) plus
-- `api_key_prefix` (first 8 chars, for display only) and backfills both
-- columns from the existing plain values.
--
-- After backfill the plain `api_key` column is dropped — the application
-- code never reads it again, and keeping it around defeats the purpose.
--
-- Backfill notes
-- ==============
-- D1 / SQLite has no built-in SHA-256 function, so we cannot hash existing
-- plain keys inside the migration. We have two options:
--
--   A. Run the JS backfill script in `scripts/migrations/021-hash-api-keys.ts`
--      against the live D1 database BEFORE applying the DROP step below.
--      The script reads each user's plain `api_key`, computes the SHA-256
--      hex, and writes `api_key_hash` + `api_key_prefix`.
--
--   B. If acceptable, simply NULL the existing keys here. Users will be
--      forced to log in again, which mints a fresh hashed key via
--      `/api/auth/code/verify` or `/api/auth/cli`.
--
-- The two-step shape below leaves the choice to the operator.
--
-- Apply via:
--   wrangler d1 execute pew-db --remote --file scripts/migrations/021-hash-api-keys.sql
--
-- ============================================================
-- Step 1 — add the new columns. Safe to run any time; nothing reads them
-- yet, and existing code keeps using `api_key` until step 3.
-- ============================================================

ALTER TABLE users ADD COLUMN api_key_hash   TEXT;
ALTER TABLE users ADD COLUMN api_key_prefix TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key_hash
  ON users (api_key_hash)
  WHERE api_key_hash IS NOT NULL;

-- ============================================================
-- Step 2 — backfill (choose ONE of the following).
--
-- Option A: run the JS script (preferred — preserves existing keys)
--
--   pnpm tsx scripts/migrations/021-hash-api-keys.ts
--
-- Option B: invalidate existing keys so users re-authenticate.
--
--   UPDATE users SET api_key = NULL WHERE api_key IS NOT NULL;
--
-- ============================================================

-- ============================================================
-- Step 3 — drop the plain-text column once the backfill is verified
-- and the application has been deployed with the new columns.
--
-- Run this as a SEPARATE migration (021-drop-plain-api-key.sql) once
-- the new code is live and traffic has cut over.
-- ============================================================

-- ALTER TABLE users DROP COLUMN api_key;
