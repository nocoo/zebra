import { describe, it, expect } from "vitest";
import { fileUnchanged } from "../utils/file-changed.js";

describe("fileUnchanged", () => {
  const curr = { inode: 100, mtimeMs: 1709827200000, size: 4096 };

  it("returns false when prev is undefined (first scan)", () => {
    expect(fileUnchanged(undefined, curr)).toBe(false);
  });

  it("returns true when all three fields match", () => {
    const prev = { inode: 100, mtimeMs: 1709827200000, size: 4096 };
    expect(fileUnchanged(prev, curr)).toBe(true);
  });

  it("returns false when inode differs (file replaced)", () => {
    const prev = { inode: 999, mtimeMs: 1709827200000, size: 4096 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });

  it("returns false when mtimeMs differs (file modified)", () => {
    const prev = { inode: 100, mtimeMs: 1709827100000, size: 4096 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });

  it("returns false when size differs (content changed)", () => {
    const prev = { inode: 100, mtimeMs: 1709827200000, size: 2048 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });

  it("returns false when prev.mtimeMs is undefined (old cursor format)", () => {
    const prev = { inode: 100, size: 4096 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });

  it("returns false when prev.size is undefined (old cursor format)", () => {
    const prev = { inode: 100, mtimeMs: 1709827200000 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });

  it("returns false when both mtimeMs and size are undefined (old cursor)", () => {
    const prev = { inode: 100 };
    expect(fileUnchanged(prev, curr)).toBe(false);
  });
});
