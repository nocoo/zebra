import { describe, it, expect } from "vitest";
import { shortModel } from "@/lib/model-helpers";

describe("shortModel", () => {
  it("strips 'models/' prefix from Gemini-style model IDs", () => {
    expect(shortModel("models/gemini-2.5-pro")).toBe("gemini-2.5-pro");
  });

  it("strips date suffix (-YYYYMMDD)", () => {
    expect(shortModel("claude-sonnet-4-20250514")).toBe("claude-sonnet-4");
  });

  it("strips both prefix and date suffix", () => {
    expect(shortModel("models/gemini-2.5-pro-20260101")).toBe("gemini-2.5-pro");
  });

  it("truncates names longer than 24 chars with ellipsis", () => {
    const longName = "a-very-long-model-name-that-exceeds-limit";
    const result = shortModel(longName);
    expect(result.length).toBe(25); // 22 chars + "..."
    expect(result.endsWith("...")).toBe(true);
  });

  it("does not truncate names exactly 24 chars", () => {
    const exact24 = "abcdefghijklmnopqrstuvwx"; // 24 chars
    expect(shortModel(exact24)).toBe(exact24);
  });

  it("does not truncate short names", () => {
    expect(shortModel("gpt-4o")).toBe("gpt-4o");
  });

  it("handles empty string", () => {
    expect(shortModel("")).toBe("");
  });

  it("does not strip partial date-like suffixes", () => {
    // "-12345678" has 8 digits but regex is /-\d{8}$/ so this would match
    // But "-1234567" (7 digits) should not
    expect(shortModel("model-1234567")).toBe("model-1234567");
  });

  it("only strips trailing date suffix, not mid-string", () => {
    // The regex uses $ anchor, so only trailing match
    expect(shortModel("claude-20250514-sonnet")).toBe("claude-20250514-sonnet");
  });
});
