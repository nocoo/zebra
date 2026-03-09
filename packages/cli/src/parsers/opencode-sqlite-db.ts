import { Database } from "bun:sqlite";
import type { MessageRow, QueryMessagesFn } from "./opencode-sqlite.js";

/**
 * Open an OpenCode SQLite database in read-only mode
 * and return a queryMessages function for use with parseOpenCodeSqlite().
 *
 * Uses bun:sqlite for zero-dependency SQLite access.
 * Returns null if the database cannot be opened.
 */
export function openMessageDb(
  dbPath: string,
): { queryMessages: QueryMessagesFn; close: () => void } | null {
  let db: Database;
  try {
    db = new Database(dbPath, { readonly: true });
  } catch {
    return null;
  }

  const stmt = db.query<MessageRow, [number]>(
    `SELECT id, session_id, time_created, data
     FROM message
     WHERE time_created > ?
     ORDER BY time_created ASC`,
  );

  return {
    queryMessages: (lastTimeCreated: number) => stmt.all(lastTimeCreated),
    close: () => db.close(),
  };
}
