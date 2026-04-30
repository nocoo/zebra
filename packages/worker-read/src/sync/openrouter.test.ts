import { describe, it, expect } from "vitest";
import sample from "./__fixtures__/openrouter.sample.json";
import { parseOpenRouter } from "./openrouter";

const NOW = "2026-04-30T00:00:00.000Z";

describe("parseOpenRouter", () => {
  it("normalizes valid entries", () => {
    const { entries } = parseOpenRouter(sample, NOW);
    const sonnet = entries.find((e) => e.model === "anthropic/claude-sonnet-4");
    expect(sonnet).toBeDefined();
    expect(sonnet!.provider).toBe("Anthropic");
    expect(sonnet!.displayName).toBe("Claude Sonnet 4");
    expect(sonnet!.inputPerMillion).toBeCloseTo(3);
    expect(sonnet!.outputPerMillion).toBeCloseTo(15);
    expect(sonnet!.cachedPerMillion).toBeCloseTo(0.3);
    expect(sonnet!.contextWindow).toBe(200000);
    expect(sonnet!.origin).toBe("openrouter");
    expect(sonnet!.updatedAt).toBe(NOW);
  });

  it("falls back displayName when name missing", () => {
    const { entries } = parseOpenRouter(sample, NOW);
    const gem = entries.find((e) => e.model === "google/gemini-2.5-pro");
    expect(gem).toBeDefined();
    expect(gem!.displayName).toBe(null);
    expect(gem!.contextWindow).toBe(null);
  });

  it("preserves zero-price entries (skip lives in merge, not parse)", () => {
    const { entries } = parseOpenRouter(sample, NOW);
    const free = entries.find((e) => e.model === "openai/gpt-free");
    expect(free).toBeDefined();
    expect(free!.inputPerMillion).toBe(0);
    expect(free!.outputPerMillion).toBe(0);
  });

  it("skips invalid prices and empty ids with warnings", () => {
    const { entries, warnings } = parseOpenRouter(sample, NOW);
    expect(entries.find((e) => e.model === "broken/model")).toBeUndefined();
    expect(entries.find((e) => e.model === "")).toBeUndefined();
    expect(warnings.some((w) => w.includes("broken/model"))).toBe(true);
    expect(warnings.some((w) => w.includes("empty id"))).toBe(true);
  });

  it("handles malformed input", () => {
    const { entries, warnings } = parseOpenRouter(null, NOW);
    expect(entries).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});
