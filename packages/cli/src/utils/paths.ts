import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Resolve default paths for Pew state and AI tool data.
 * All paths can be overridden for testing.
 */
export function resolveDefaultPaths(home = homedir()) {
  const codexHome = process.env.CODEX_HOME || join(home, ".codex");
  return {
    /** Pew state directory: ~/.config/pew/ */
    stateDir: join(home, ".config", "pew"),
    /** Claude Code data: ~/.claude */
    claudeDir: join(home, ".claude"),
    /** Codex CLI sessions: ~/.codex/sessions (or $CODEX_HOME/sessions) */
    codexSessionsDir: join(codexHome, "sessions"),
    /** Gemini CLI data: ~/.gemini */
    geminiDir: join(home, ".gemini"),
    /** OpenCode message storage: ~/.local/share/opencode/storage/message */
    openCodeMessageDir: join(
      home,
      ".local",
      "share",
      "opencode",
      "storage",
      "message",
    ),
    /** OpenCode SQLite database: ~/.local/share/opencode/opencode.db */
    openCodeDbPath: join(home, ".local", "share", "opencode", "opencode.db"),
    /** OpenClaw data: ~/.openclaw */
    openclawDir: join(home, ".openclaw"),
  };
}
