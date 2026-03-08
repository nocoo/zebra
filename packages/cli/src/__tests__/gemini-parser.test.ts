import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseGeminiFile,
  normalizeGeminiTokens,
  diffTotals,
} from "../parsers/gemini.js";

/** Helper: create a Gemini session with messages */
function geminiSession(messages: unknown[]): string {
  return JSON.stringify({
    sessionId: "ses-001",
    projectHash: "abc",
    startTime: "2026-03-07T10:00:00.000Z",
    lastUpdated: "2026-03-07T10:30:00.000Z",
    kind: "main",
    messages,
  });
}

/** Helper: create a gemini message with tokens */
function geminiMsg(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "msg-001",
    timestamp: "2026-03-07T10:15:00.000Z",
    type: "gemini",
    content: "Some response",
    model: "gemini-3-flash-preview",
    tokens: {
      input: 5000,
      output: 200,
      cached: 3000,
      thoughts: 100,
      tool: 50,
      total: 8350,
    },
    ...overrides,
  };
}

describe("normalizeGeminiTokens", () => {
  it("should normalize standard gemini tokens", () => {
    const result = normalizeGeminiTokens({
      input: 5000,
      output: 200,
      cached: 3000,
      thoughts: 100,
      tool: 50,
      total: 8350,
    });
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(5000);
    expect(result!.cachedInputTokens).toBe(3000);
    expect(result!.outputTokens).toBe(250); // output + tool
    expect(result!.reasoningOutputTokens).toBe(100); // thoughts
  });

  it("should return null for missing tokens", () => {
    expect(normalizeGeminiTokens(null)).toBeNull();
    expect(normalizeGeminiTokens(undefined)).toBeNull();
  });

  it("should handle zero tokens", () => {
    const result = normalizeGeminiTokens({
      input: 0,
      output: 0,
      cached: 0,
      thoughts: 0,
      tool: 0,
      total: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(0);
  });
});

describe("diffTotals", () => {
  it("should return current if no previous", () => {
    const current = {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 0,
    };
    const result = diffTotals(current, null);
    expect(result).toEqual(current);
  });

  it("should diff current minus previous", () => {
    const prev = {
      inputTokens: 100,
      cachedInputTokens: 10,
      outputTokens: 50,
      reasoningOutputTokens: 5,
    };
    const curr = {
      inputTokens: 300,
      cachedInputTokens: 30,
      outputTokens: 150,
      reasoningOutputTokens: 15,
    };
    const result = diffTotals(curr, prev);
    expect(result).not.toBeNull();
    expect(result!.inputTokens).toBe(200);
    expect(result!.cachedInputTokens).toBe(20);
    expect(result!.outputTokens).toBe(100);
    expect(result!.reasoningOutputTokens).toBe(10);
  });

  it("should return current on total reset (totals decreased)", () => {
    const prev = {
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 200,
      reasoningOutputTokens: 0,
    };
    const curr = {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 0,
    };
    const result = diffTotals(curr, prev);
    expect(result).toEqual(curr);
  });

  it("should return null if same totals (no change)", () => {
    const same = {
      inputTokens: 100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningOutputTokens: 0,
    };
    const result = diffTotals(same, { ...same });
    expect(result).toBeNull();
  });
});

describe("parseGeminiFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "zebra-gemini-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("should parse gemini messages with tokens", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      { type: "user", content: "Hello" },
      geminiMsg(),
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].source).toBe("gemini-cli");
    expect(result.deltas[0].model).toBe("gemini-3-flash-preview");
    expect(result.deltas[0].tokens.inputTokens).toBe(5000);
    expect(result.deltas[0].tokens.outputTokens).toBe(250); // output + tool
    expect(result.deltas[0].tokens.reasoningOutputTokens).toBe(100);
    expect(result.lastIndex).toBe(1);
  });

  it("should compute incremental deltas using diff", async () => {
    const filePath = join(tempDir, "session.json");
    // Two gemini messages with cumulative tokens
    await writeFile(filePath, geminiSession([
      geminiMsg({
        id: "msg-1",
        timestamp: "2026-03-07T10:00:00.000Z",
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      }),
      geminiMsg({
        id: "msg-2",
        timestamp: "2026-03-07T10:10:00.000Z",
        tokens: { input: 300, output: 150, cached: 50, thoughts: 10, tool: 0, total: 510 },
      }),
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(2);
    // First: no previous → full values
    expect(result.deltas[0].tokens.inputTokens).toBe(100);
    // Second: diff from previous
    expect(result.deltas[1].tokens.inputTokens).toBe(200); // 300 - 100
    expect(result.deltas[1].tokens.outputTokens).toBe(100); // 150 - 50
    expect(result.deltas[1].tokens.cachedInputTokens).toBe(50);
    expect(result.deltas[1].tokens.reasoningOutputTokens).toBe(10);
  });

  it("should resume from lastIndex", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      geminiMsg({
        id: "msg-1",
        timestamp: "2026-03-07T10:00:00.000Z",
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      }),
      geminiMsg({
        id: "msg-2",
        timestamp: "2026-03-07T10:10:00.000Z",
        tokens: { input: 300, output: 150, cached: 50, thoughts: 10, tool: 0, total: 510 },
      }),
    ]));

    // First parse
    const r1 = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(r1.deltas).toHaveLength(2);

    // Resume — no new messages
    const r2 = await parseGeminiFile({
      filePath,
      startIndex: r1.lastIndex,
      lastTotals: r1.lastTotals,
    });
    expect(r2.deltas).toHaveLength(0);
  });

  it("should handle empty file", async () => {
    const filePath = join(tempDir, "empty.json");
    await writeFile(filePath, "");

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(0);
  });

  it("should handle missing file", async () => {
    const result = await parseGeminiFile({
      filePath: join(tempDir, "nonexistent.json"),
      startIndex: -1,
      lastTotals: null,
    });
    expect(result.deltas).toHaveLength(0);
  });

  it("should handle corrupted JSON", async () => {
    const filePath = join(tempDir, "bad.json");
    await writeFile(filePath, "not valid json{{{");

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(0);
  });

  it("should skip user messages (no tokens)", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      { type: "user", content: "Hello", timestamp: "2026-03-07T10:00:00.000Z" },
      { type: "user", content: "World", timestamp: "2026-03-07T10:01:00.000Z" },
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(0);
  });

  it("should reset on lastIndex beyond array length (file rewrite)", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([geminiMsg()]));

    // Pass a lastIndex beyond the array
    const result = await parseGeminiFile({
      filePath,
      startIndex: 100,
      lastTotals: null,
    });
    expect(result.deltas).toHaveLength(1);
    expect(result.lastIndex).toBe(0);
  });

  it("should handle non-array messages field", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, JSON.stringify({
      sessionId: "ses-001",
      messages: "not an array",
    }));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(0);
  });

  it("should handle missing messages field", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, JSON.stringify({
      sessionId: "ses-001",
    }));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(0);
  });

  it("should skip consecutive messages with identical cumulative tokens (zero delta)", async () => {
    const filePath = join(tempDir, "session.json");
    const sameTokens = { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 };
    await writeFile(filePath, geminiSession([
      geminiMsg({
        id: "msg-1",
        timestamp: "2026-03-07T10:00:00.000Z",
        tokens: sameTokens,
      }),
      geminiMsg({
        id: "msg-2",
        timestamp: "2026-03-07T10:05:00.000Z",
        tokens: sameTokens, // same cumulative → zero delta
      }),
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    // Only the first message produces a delta; the second is identical → skipped
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].tokens.inputTokens).toBe(100);
  });

  it("should skip null or non-object entries in messages array", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      null,
      "not an object",
      geminiMsg(),
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(1);
  });

  it("should skip messages without timestamp even if they have tokens", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      {
        type: "gemini",
        model: "gemini-3-flash-preview",
        // no timestamp
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      },
      geminiMsg({
        id: "msg-2",
        timestamp: "2026-03-07T10:10:00.000Z",
        tokens: { input: 300, output: 150, cached: 0, thoughts: 0, tool: 0, total: 450 },
      }),
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    // First message skipped (no timestamp) but totals still tracked
    // Second message diffs against first's totals
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].tokens.inputTokens).toBe(200); // 300 - 100
  });

  it("should use 'unknown' model when no model field is present", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      {
        id: "msg-1",
        timestamp: "2026-03-07T10:00:00.000Z",
        type: "gemini",
        // no model field
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      },
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(1);
    expect(result.deltas[0].model).toBe("unknown");
  });

  it("should track model across messages", async () => {
    const filePath = join(tempDir, "session.json");
    await writeFile(filePath, geminiSession([
      geminiMsg({
        id: "msg-1",
        timestamp: "2026-03-07T10:00:00.000Z",
        model: "gemini-3-flash-preview",
        tokens: { input: 100, output: 50, cached: 0, thoughts: 0, tool: 0, total: 150 },
      }),
      {
        id: "msg-2",
        timestamp: "2026-03-07T10:10:00.000Z",
        type: "gemini",
        // no model — should inherit from previous
        tokens: { input: 300, output: 150, cached: 0, thoughts: 0, tool: 0, total: 450 },
      },
    ]));

    const result = await parseGeminiFile({ filePath, startIndex: -1, lastTotals: null });
    expect(result.deltas).toHaveLength(2);
    expect(result.deltas[1].model).toBe("gemini-3-flash-preview");
    expect(result.lastModel).toBe("gemini-3-flash-preview");
  });
});
