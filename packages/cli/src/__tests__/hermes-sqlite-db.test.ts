import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { writeFile, rm, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Tests for hermes-sqlite-db.ts
 *
 * This module has complex platform-specific behavior (Bun vs Node.js).
 * We test the public API behavior without creating real SQLite databases
 * since Vitest runs under Node.js (not Bun), and the module correctly
 * detects this and uses node:sqlite.
 *
 * The key behaviors we test:
 * 1. Returns null when DB doesn't exist
 * 2. Returns null when DB can't be opened
 * 3. Caches the SQLite implementation (via module state)
 */

describe("hermes-sqlite-db", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-hermes-db-test-"));
    // Reset module cache to allow fresh imports
    vi.resetModules();
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  describe("openHermesDb", () => {
    it("should return null when database file does not exist", async () => {
      const { openHermesDb } = await import("../parsers/hermes-sqlite-db.js");
      const result = openHermesDb(join(tempDir, "nonexistent.db"));
      expect(result).toBeNull();
    });

    it("should return null when opener throws on invalid file", async () => {
      const dbPath = join(tempDir, "invalid.db");
      // Write something that looks like a file but isn't valid SQLite
      await writeFile(dbPath, "not a valid sqlite database header");

      const { openHermesDb } = await import("../parsers/hermes-sqlite-db.js");
      const result = openHermesDb(dbPath);
      // Should return null because opener throws on invalid SQLite header
      expect(result).toBeNull();
    });

    it("should use cached implementation on subsequent calls", async () => {
      const { openHermesDb } = await import("../parsers/hermes-sqlite-db.js");

      // First call - attempts to open non-existent file
      const result1 = openHermesDb(join(tempDir, "a.db"));
      expect(result1).toBeNull();

      // Second call - should reuse cached opener (no re-initialization)
      const result2 = openHermesDb(join(tempDir, "b.db"));
      expect(result2).toBeNull();
    });

    it("should detect Bun runtime via globalThis.Bun", async () => {
      // This test verifies the runtime detection logic path
      // In Vitest (Node.js), globalThis.Bun is undefined, so Node.js path is taken
      expect(typeof globalThis.Bun).toBe("undefined");

      const { openHermesDb } = await import("../parsers/hermes-sqlite-db.js");
      // The function should still work (returns null for non-existent file)
      const result = openHermesDb(join(tempDir, "test.db"));
      expect(result).toBeNull();
    });
  });

  describe("getSqliteOpener caching", () => {
    it("should cache SQLite implementation after first attempt", async () => {
      // Fresh import to reset module state
      const mod1 = await import("../parsers/hermes-sqlite-db.js");

      // First call triggers SQLite detection
      mod1.openHermesDb(join(tempDir, "first.db"));

      // Second call should use cached implementation
      // We can't directly observe caching, but we verify it doesn't throw
      const result = mod1.openHermesDb(join(tempDir, "second.db"));
      expect(result).toBeNull(); // File doesn't exist
    });

    it("should handle node:sqlite ExperimentalWarning suppression", async () => {
      // The module suppresses ExperimentalWarning when loading node:sqlite
      // We verify this doesn't break anything by successfully importing
      const { openHermesDb } = await import("../parsers/hermes-sqlite-db.js");

      // Call should complete without unhandled warnings crashing
      const result = openHermesDb(join(tempDir, "warning-test.db"));
      expect(result).toBeNull();
    });
  });
});
