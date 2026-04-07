-- Headless CLI auth sessions (temporary, polled by CLI)
CREATE TABLE IF NOT EXISTS cli_auth_sessions (
  session_id TEXT PRIMARY KEY,
  api_key TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
