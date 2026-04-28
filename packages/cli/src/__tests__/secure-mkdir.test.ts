import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSecure, mkdirSecureSync, SECURE_DIR_MODE } from "../storage/secure-mkdir.js";

describe("secure-mkdir", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "pew-secure-mkdir-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("SECURE_DIR_MODE", () => {
    it("should be 0o700 (owner rwx only)", () => {
      expect(SECURE_DIR_MODE).toBe(0o700);
    });
  });

  describe("mkdirSecure()", () => {
    it("should create directory with mode 0o700", async () => {
      const testDir = join(tempDir, "secure-dir");

      await mkdirSecure(testDir);

      const stats = await stat(testDir);
      // On Unix, mode includes file type bits; mask to get permission bits only
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o700);
    });

    it("should create nested directories with recursive option", async () => {
      const testDir = join(tempDir, "nested", "deep", "dir");

      await mkdirSecure(testDir, { recursive: true });

      const stats = await stat(testDir);
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o700);
    });

    it("should not throw when directory already exists with recursive: true", async () => {
      const testDir = join(tempDir, "existing-dir");

      await mkdirSecure(testDir);
      await expect(mkdirSecure(testDir, { recursive: true })).resolves.not.toThrow();
    });
  });

  describe("mkdirSecureSync()", () => {
    it("should create directory with mode 0o700", async () => {
      const testDir = join(tempDir, "secure-dir-sync");

      mkdirSecureSync(testDir);

      const stats = await stat(testDir);
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o700);
    });

    it("should create nested directories with recursive option", async () => {
      const testDir = join(tempDir, "nested", "deep", "dir-sync");

      mkdirSecureSync(testDir, { recursive: true });

      const stats = await stat(testDir);
      const permissions = stats.mode & 0o777;
      expect(permissions).toBe(0o700);
    });
  });
});
