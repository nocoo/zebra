-- Add is_public column to users table
-- Users must explicitly opt-in to public visibility via Settings.
-- Default 0 = private. After applying, backfill existing public users:
--   UPDATE users SET is_public = 1 WHERE slug IS NOT NULL;

ALTER TABLE users ADD COLUMN is_public INTEGER NOT NULL DEFAULT 0;
