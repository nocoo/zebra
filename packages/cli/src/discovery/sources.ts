import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * Recursively collect files matching a predicate under a directory.
 * Uses withFileTypes to avoid separate stat() calls per entry.
 * Returns absolute paths sorted alphabetically.
 */
async function collectFiles(
  dir: string,
  predicate: (name: string) => boolean,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && predicate(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results.sort();
}

/**
 * Discover Claude Code JSONL files.
 * Path pattern: ~/.claude/projects/\*\*\/*.jsonl
 */
export async function discoverClaudeFiles(
  claudeDir: string,
): Promise<string[]> {
  const projectsDir = join(claudeDir, "projects");
  return collectFiles(projectsDir, (name) => name.endsWith(".jsonl"));
}

/**
 * Discover Gemini CLI session files.
 * Path pattern: ~/.gemini/tmp/\*\/chats/session-*.json
 */
export async function discoverGeminiFiles(
  geminiDir: string,
): Promise<string[]> {
  const tmpDir = join(geminiDir, "tmp");
  return collectFiles(tmpDir, (name) =>
    name.startsWith("session-") && name.endsWith(".json"),
  );
}

/**
 * Result of OpenCode discovery with directory-level mtime tracking.
 */
export interface OpenCodeDiscoveryResult {
  /** Files in changed directories (only these need parsing) */
  files: string[];
  /** Updated directory mtimes (all directories, for persisting) */
  dirMtimes: Record<string, number>;
  /** Number of directories skipped due to unchanged mtime */
  skippedDirs: number;
}

/**
 * Discover OpenCode message files with directory-level mtime optimization.
 *
 * Instead of stat()-ing all 66K+ message files, we stat() only the ~3K
 * session directories. If a directory's mtime hasn't changed since last
 * sync, we skip the entire directory (no readdir, no file stat).
 *
 * Path pattern: ~/.local/share/opencode/storage/message/ses_*\/msg_*.json
 */
export async function discoverOpenCodeFiles(
  messageDir: string,
  knownDirMtimes?: Record<string, number>,
): Promise<OpenCodeDiscoveryResult> {
  const known = knownDirMtimes ?? {};
  const newDirMtimes: Record<string, number> = {};
  const files: string[] = [];
  let skippedDirs = 0;

  let entries: import("node:fs").Dirent[];
  try {
    entries = await readdir(messageDir, { withFileTypes: true });
  } catch {
    return { files: [], dirMtimes: {}, skippedDirs: 0 };
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const dirPath = join(messageDir, entry.name);
    let dirStat: import("node:fs").Stats;
    try {
      dirStat = await stat(dirPath);
    } catch {
      continue;
    }

    const currentMtime = dirStat.mtimeMs;
    newDirMtimes[dirPath] = currentMtime;

    // Skip directory if mtime unchanged
    if (known[dirPath] === currentMtime) {
      skippedDirs++;
      continue;
    }

    // Directory changed — read its files
    let dirEntries: import("node:fs").Dirent[];
    try {
      dirEntries = await readdir(dirPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const fileEntry of dirEntries) {
      if (fileEntry.isFile() && fileEntry.name.endsWith(".json")) {
        files.push(join(dirPath, fileEntry.name));
      }
    }
  }

  return { files: files.sort(), dirMtimes: newDirMtimes, skippedDirs };
}

/**
 * Discover OpenClaw session files.
 * Path pattern: ~/.openclaw/agents/\*\/sessions/*.jsonl
 */
export async function discoverOpenClawFiles(
  openclawDir: string,
): Promise<string[]> {
  const agentsDir = join(openclawDir, "agents");
  return collectFiles(agentsDir, (name) => name.endsWith(".jsonl"));
}
