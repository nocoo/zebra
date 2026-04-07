-- Migration 017: Add failed_attempts tracking to auth_codes for brute-force protection.
--
-- If a wrong code is attempted against a user's active code, increment failed_attempts.
-- Codes with failed_attempts > 0 are automatically invalidated.
--
-- Apply via: wrangler d1 execute pew-db --remote --file scripts/migrations/017-auth-code-failed-attempts.sql

ALTER TABLE auth_codes ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
