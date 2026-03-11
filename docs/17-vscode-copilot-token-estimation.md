# 17 — VSCode Copilot Token Estimation Research

> Research spike: can we extract token usage from VSCode Copilot Chat local data?

## Status: Research

---

## Context

Pew currently tracks 5 AI coding tools (Claude Code, Codex, Gemini CLI, OpenCode, OpenClaw),
all of which write structured logs locally with **exact** token counts provided by
their respective APIs.

VSCode + GitHub Copilot Chat is the most popular AI coding tool but does **not** log
token usage locally. This document investigates whether we can **estimate** token usage
from the data that *is* available.

---

## Data Locations (macOS)

```
~/Library/Application Support/Code/User/
├── workspaceStorage/<workspace-hash>/
│   ├── chatSessions/<session-uuid>.jsonl         # <-- main data source
│   ├── chatEditingSessions/<session-uuid>/state.json
│   └── GitHub.copilot-chat/
│       ├── chat-session-resources/               # tool call artifacts
│       ├── local-index.1.db                      # code embedding index
│       └── workspace-chunks.db                   # chunk embeddings
├── globalStorage/
│   ├── github.copilot-chat/                      # extension assets (no usage data)
│   ├── emptyWindowChatSessions/*.jsonl            # sessions outside any workspace
│   └── state.vscdb                               # SQLite KV store (no token data)
└── chatLanguageModels.json                        # model registry
```

### File Discovery Challenges

- One `chatSessions/` directory per **workspace** (keyed by workspace hash)
- Multiple workspaces → multiple directories under `workspaceStorage/`
- `emptyWindowChatSessions/` for window-less sessions
- No single index file — must scan all workspace directories

---

## JSONL File Format: CRDT Operation Log

Each `.jsonl` file is a **CRDT-style append-only operation log**, not a simple array
of messages. Three operation kinds:

| kind | Name | Description |
|------|------|-------------|
| `0` | **Snapshot** | Full session state. First line of file. May have empty `requests[]` |
| `1` | **Set** | Overwrite value at a JSON path, e.g. `['requests', 0, 'result']` |
| `2` | **Append** | Append to array at path, e.g. `['requests']` or `['requests', N, 'response']` |

### Reconstructing Session State

To get the current session state, you must **replay** all operations in order:

```
line 0 (kind=0): state = snapshot.v
line N (kind=1): set(state, line.k, line.v)      # e.g. state.requests[0].result = v
line N (kind=2): append(state, line.k, line.v)    # e.g. state.requests.push(...v)
```

The `k` field is a JSON path array like `["requests", 0, "response"]`.

---

## Available Data Per Request

### Precise Fields

| Field | Path | Example |
|-------|------|---------|
| Model ID | `request.modelId` | `"copilot/claude-opus-4.6"` |
| Timestamp | `request.timestamp` | `1772780377684` (Unix ms) |
| Request ID | `request.requestId` | `"request_29c78eba-..."` |
| Response ID | `request.responseId` | `"response_dc6357b6-..."` |
| Extension version | `request.agent.extensionVersion` | `"0.38.0"` |
| Total elapsed (ms) | `request.result.timings.totalElapsed` | `356743` |
| First token (ms) | `request.result.timings.firstProgress` | `6613` |
| Premium multiplier | `request.result.details` | `"Claude Opus 4.6 • 3x"` |
| Model max input | `inputState.selectedModel.metadata.maxInputTokens` | `127805` |
| Model max output | `inputState.selectedModel.metadata.maxOutputTokens` | `64000` |

### User Message (Input)

| Field | Content | Token Estimation Quality |
|-------|---------|--------------------------|
| `request.message.text` | Raw user input text | **Partial** — only the user's typed message |
| `request.variableData.variables` | System prompts, instruction files | **Partial** — serialized prompt instructions |

**What's missing from input estimation:**
- Full conversation history sent to the model
- File contents injected by `@workspace`, `@file`, `#selection` references
- Tool call results from previous turns
- Internal system prompts added by Copilot

**Estimated coverage: ~10-30% of actual input tokens.**

### Assistant Response (Output)

Response items are appended incrementally via `kind=2` operations to the
`['requests', N, 'response']` path. Response item types:

| Response `kind` | Description | Has text? |
|-----------------|-------------|-----------|
| (none/null) | Markdown text output | `value` field — full assistant text |
| `"thinking"` | Reasoning/thinking text | `value` field — full thinking text |
| `"toolInvocationSerialized"` | Tool call record | `invocationMessage`, `pastTenseMessage` |
| `"inlineReference"` | File/symbol reference | No estimable text |
| `"textEditGroup"` | File edit operations | Edit diffs (code changes) |
| `"codeblockUri"` | Code block reference | No estimable text |
| `"mcpServersStarting"` | MCP server lifecycle | No text |
| `"progressMessage"` | Status updates | Short status text |

**The `value` field on null-kind and thinking-kind items contains the complete
assistant response text.** This is the most reliable data for estimation.

**Estimated coverage: ~80-90% of actual output tokens** (missing some structured
tool-call output and internal reasoning overhead).

---

## Estimation Approach

### Output Tokens (Moderate Confidence)

```
output_tokens ≈ (sum of response[].value chars where kind is null or "thinking") / 4
```

- English text: ~4 chars/token (GPT/Claude tokenizers)
- Code: ~3.5 chars/token
- Mixed: ~3.8 chars/token
- **Expected accuracy: ±20-30%**

### Input Tokens (Low Confidence)

```
input_tokens_lower_bound ≈ (message.text chars + variableData chars) / 4
```

- This is a **severe underestimate** — actual input is 3-10x larger
- No way to recover injected file contents, conversation history, or tool results
- **Expected accuracy: captures only 10-30% of actual input**

### Alternative: Heuristic Model

Use `result.timings` + model pricing multipliers to back-calculate approximate token count:

```
total_cost_units ≈ f(totalElapsed, model, multiplier)
```

This is even more speculative and model-dependent.

---

## Comparison with Existing Sources

| Source | Input Tokens | Output Tokens | Data Quality |
|--------|-------------|---------------|--------------|
| Claude Code | Exact | Exact | API-reported per message |
| Gemini CLI | Exact | Exact | Cumulative in session JSON |
| OpenCode | Exact | Exact | Per-message in JSON/SQLite |
| OpenClaw | Exact | Exact | API-reported per message |
| **VSCode Copilot** | **~10-30%** | **~70-90%** | **Estimated from text** |

---

## Implementation Considerations

### Parser Complexity: High

1. **CRDT replay** — must replay operation log to reconstruct state (not just read JSON)
2. **Multi-workspace scanning** — enumerate all `workspaceStorage/*/chatSessions/`
3. **Incremental sync** — need byte-offset cursor per `.jsonl` file
4. **Model ID normalization** — `"copilot/claude-opus-4.6"` → strip `"copilot/"` prefix
5. **Tokenizer choice** — char/4 is crude; could use `tiktoken` or `@anthropic-ai/tokenizer`
   for better accuracy (adds dependency)

### Data Labeling

If implemented, records should be clearly labeled:

```typescript
source: "vscode-copilot"  // new Source enum value
// Metadata flag:
estimated: true            // distinguish from exact counts
```

### Open Questions

1. **Cross-platform paths**: What are the equivalent paths on Linux/Windows?
   - Linux: `~/.config/Code/User/workspaceStorage/...`
   - Windows: `%APPDATA%/Code/User/workspaceStorage/...`
2. **VSCode Insiders**: Same structure under `Code - Insiders/` directory?
3. **Cursor IDE**: Fork of VSCode — same JSONL format under `Cursor/` directory?
4. **Windsurf/Cody/Continue**: Other VSCode AI extensions with similar data?
5. **File rotation**: Does VSCode ever truncate/rotate JSONL files?
6. **GitHub API**: Does `api.github.com` expose per-session token usage?
   Would make this entire approach unnecessary.

---

## Recommendation

**Wait.** The estimation quality (especially for input tokens) is poor compared to
other sources. Two paths forward:

1. **GitHub Copilot Usage API** — GitHub may expose per-user token usage via API.
   This would give exact numbers without any local parsing. Check:
   - `GET /user/copilot/usage` (hypothetical)
   - GitHub Settings → Copilot → Usage dashboard data source

2. **VSCode Extension API** — A lightweight VSCode extension could intercept the
   `LanguageModelChat` API and log exact token counts locally. This would provide
   Claude Code-level accuracy.

If neither option materializes, the local JSONL parsing approach described here
is a viable fallback — but the `estimated` flag must be prominently displayed in
the dashboard to avoid misleading users.

---

## Appendix: Sample Data Structures

### kind=0 Snapshot (first line)

```jsonc
{
  "kind": 0,
  "v": {
    "version": 3,
    "creationDate": 1772780355206,
    "sessionId": "3a08f728-...",
    "responderUsername": "GitHub Copilot",
    "requests": [
      {
        "requestId": "request_29c78eba-...",
        "timestamp": 1772780377684,
        "modelId": "copilot/claude-opus-4.6",
        "message": { "text": "用户输入的原始文本..." },
        "response": [
          { "kind": "mcpServersStarting", "didStartServerIds": [] }
        ],
        "variableData": { "variables": [...] }
      }
    ],
    "inputState": {
      "selectedModel": {
        "identifier": "copilot/claude-opus-4.6",
        "metadata": {
          "maxInputTokens": 127805,
          "maxOutputTokens": 64000,
          "multiplierNumeric": 3
        }
      }
    }
  }
}
```

### kind=1 Set (result with timings)

```jsonc
{
  "kind": 1,
  "k": ["requests", 0, "result"],
  "v": {
    "timings": { "totalElapsed": 356743, "firstProgress": 6613 },
    "details": "Claude Opus 4.6 • 3x",
    "metadata": { "renderedUserMessage": "..." }
  }
}
```

### kind=2 Append (response text)

```jsonc
{
  "kind": 2,
  "k": ["requests", 0, "response"],
  "v": [
    { "value": "I'll help you with...", "kind": null },          // markdown text
    { "value": "Let me think about...", "kind": "thinking" },     // reasoning
    { "kind": "toolInvocationSerialized", "toolId": "copilot_readFile", ... }
  ]
}
```
