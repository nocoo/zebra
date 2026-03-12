# 19 — Token Inflation Audit & Fix Plan

## Background

Dashboard 上 Total Tokens 异常膨胀，经审计发现两个独立问题导致数据严重失真。

---

## Issue 1: Device ID Duplication (dev/prod 分裂)

### Root Cause

`ConfigManager` 根据 `dev` flag 读取不同的 config 文件：

- `config.json` (prod) → device ID: `7f2bdbdb-...`
- `config.dev.json` (dev) → device ID: `14a28b16-...`

同一台机器上 `pew sync` 和 `pew sync --dev` 使用不同的 device_id，导致相同的原始数据被作为两个独立 device 上传到 D1。

**代码位置**: `packages/cli/src/config/manager.ts:16-18`

```typescript
constructor(configDir: string, dev = false) {
  const filename = dev ? DEV_CONFIG : PROD_CONFIG;
  this.configPath = join(configDir, filename);
}
```

### Impact

- UNIQUE constraint `(user_id, device_id, source, model, hour_start)` 中 `device_id` 不同，相同数据被视为两条独立记录
- Dashboard `SUM(total_tokens)` 跨 device 聚合，同一份数据被计算两次
- 本机验证：dev device 2,911 行 **100% 与 prod device 重叠**，dev 的 token 值从未超过 prod

### Status

**已修复 (数据层)**：已从 D1 删除 dev device `14a28b16-...` 的 2,911 行 usage_records + 1 行 device_aliases。

**待修复 (代码层)**：需要将 `deviceId` 改为环境无关的共享存储。

---

## Issue 2: Queue Accumulation on Cursor Reset (4x Token Inflation)

### Root Cause

数据管线中存在架构级 bug，cursor reset 导致 D1 数据按倍数膨胀：

1. `rm cursors.json` 清除游标后 re-sync
2. 所有历史 deltas 被重新解析
3. 新的 records **append** 到 `queue.jsonl`（追加，不是覆盖）
4. Upload 时 `aggregateRecords()` 读取全部未上传的 queue records 按 `(source, model, hour_start, device_id)` 做 **SUM**
5. Worker `ON CONFLICT DO UPDATE SET total_tokens = excluded.total_tokens` 用 SUM 值 **覆盖** D1

**结果**：N 次 cursor reset + sync + upload → D1 值 = N × 真实值

**代码位置**:
- Queue append: `packages/cli/src/storage/base-queue.ts:39-43` (`appendBatch`)
- Aggregation SUM: `packages/cli/src/commands/upload.ts:52-72` (`aggregateRecords`)
- Worker overwrite: `packages/worker/src/index.ts:48-58` (`TOKEN_UPSERT_SQL`)
- Cursor persist before queue: `packages/cli/src/commands/sync.ts:339-345`

### Evidence

本机原始数据 vs D1 (prod device `7f2bdbdb-...`) 对比：

| Source | Local Raw | D1 Prod | Ratio |
|--------|-----------|---------|-------|
| opencode | 7,450,016,338 | 17,607,707,877 | **2.36x** |
| claude-code | 354,044,326 | 1,416,682,362 | **4.00x** |
| codex | 301,976,679 | 1,187,600,717 | **3.93x** |
| gemini-cli | 5,423,314 | 21,693,256 | **4.00x** |
| vscode-copilot | 2,980,668 | 11,922,672 | **4.00x** |
| **Total** | **8,114,441,325** | **20,245,606,884** | **2.49x** |

claude-code / codex / gemini-cli / vscode-copilot 均精确 **4.00x**，说明进行了 4 次 cursor reset。
opencode 为 2.36x 因为 opencode 数据随时间变化（新增 session 改变了累积值）。

### Additional Context: `default` Device

`default` device（device_id 功能上线前的遗留数据）情况：

- 4,883 行，17.6B tokens
- 与 prod device 重叠 2,837 行（100% 的 prod 时间范围内）
- 2,046 行为独有数据：
  - 60 行 2025 年旧数据（pre device-id era）
  - 1,986 行 2026 年数据中 prod device 没有的 source/model 组合（如 `openclaw` 1,315 行、`github_copilot/*` 模型等）
- 11 行 default > prod（集中在 2026-02-16 opencode/claude-opus-4.6）
- `openclaw` 数据（309M tokens）仅存在于 `default` 和 Mac Studio device 中，本机无 openclaw 原始文件

**结论**：`default` device 混合了多台机器的数据（device_id 功能上线前所有机器共用 `"default"`），不能简单删除或合并。

---

## Root Cause Analysis: Why Idempotency Was Broken

设计意图是幂等的：Worker 的 `ON CONFLICT DO UPDATE SET total_tokens = excluded.total_tokens` 是覆盖语义。相同值上传两次，D1 结果不变。

**但幂等性在客户端聚合层被瓦解了，而非 D1 层。**

问题的因果链：

1. **Queue 是 append-only 的** — `base-queue.ts:43` 用 `appendFile`，每次 sync 的 records 追加到 `queue.jsonl` 末尾，从不清空。
2. **Upload 读取 queue 后做 SUM 聚合** — `upload.ts:52-72` 的 `aggregateRecords()` 把 queue 中所有未上传的 records 按 `(source, model, hour_start, device_id)` 做 SUM。
3. **Cursor reset 触发全量重扫** — `rm cursors.json` 后 re-sync，所有日志从头解析，产生的 records 与上次一模一样，但被 **append** 到 queue 里。Queue 现在有两份相同数据。
4. **聚合后值翻倍** — `aggregateRecords()` 把两份相同 records 做 SUM → 值 = 2x 真实值。Worker 收到的 "覆盖值" 本身就是膨胀的。

**核心矛盾**：Queue 用 append 语义（适合增量数据），cursor reset 产生全量数据（不是增量），`aggregateRecords()` 对 queue 做 SUM（假设无重复）。三者组合打破了幂等性。

---

## Fix Plan

**对外一句话**："升级新版 CLI 后，执行一次 `pew reset`，再同步一次，状态就恢复正常。"

核心保证：
1. `pew reset` 能彻底清掉会导致 token inflation 的本地坏状态
2. reset 后第一次 sync 产出正确的 queue 和正确的上传值
3. 之后的 sync 永远安全，不因 cursor reset、upload 失败、重复扫描而膨胀

### Step 1: Fix Token Queue Semantics (CLI)

**目标**：从根本上消除 queue 累积问题。Queue 不再是 "append-only + upload 时 SUM"，而是 "每次 sync 结束后 queue 始终是当前未上传的正确聚合快照"。

**当前模型（有 bug）**：

```
sync:     parse deltas → aggregate into buckets → appendBatch(newRecords)
upload:   readFromOffset(savedOffset) → aggregateRecords(SUM) → POST → saveOffset
```

append 意味着同一个 key 可以在 queue 中出现多次（cursor reset 后更是 N 倍），aggregateRecords 做 SUM 把重复项累加 → 膨胀。

**新模型**：

```
sync:     parse deltas → aggregate into buckets → read old unread records
          → merge old + new by key (take MAX per field, not SUM) → overwrite queue → offset = 0
upload:   readFromOffset(0) → POST (records already aggregated, no SUM needed) → saveOffset
```

**详细实现**：

`sync.ts` 尾部（替换 `packages/cli/src/commands/sync.ts:339-350`）：

```
1. oldOffset = queue.loadOffset()
2. { records: oldRecords } = queue.readFromOffset(oldOffset)
3. merged = mergeRecords([...oldRecords, ...newRecords])
   // mergeRecords: 按 (source, model, hour_start, device_id) 分组
   // 同 key 的多条 record 取每个 token field 的 MAX（不是 SUM）
   // MAX 语义：增量 sync 的 newRecords 值 >= oldRecords 值（因为 token 只增不减）
   //           cursor reset 后 newRecords 是全量重扫的正确值，也 >= 旧值
   //           所以 MAX 在所有场景下都产出正确结果
4. queue.overwrite(merged)   // 原子写入：write to tmp → rename
5. queue.saveOffset(0)       // offset 归零（文件被重写了，所有内容都是未上传的）
6. cursorStore.save(cursors)
```

注意 cursor 保存移到 queue overwrite **之后**。旧代码先保存 cursor 再 append queue，是为了防止 crash 导致重复（cursor saved + queue not written = 数据丢失但不重复）。新模型下 queue 是 overwrite + MAX 语义，即使 crash 导致 cursor saved 但 queue 未写入，下次 sync 会重新解析并 overwrite → 值仍然正确。

`base-queue.ts` 新增方法：

```typescript
/** Atomically overwrite the queue with new records (write tmp → rename) */
async overwrite(records: T[]): Promise<void>
```

`upload.ts` 的 `aggregateRecords()` 变为 **defense-in-depth**：保留函数但语义从 SUM 改为 **pass-through**（或保留 SUM 但不会影响结果，因为 queue 中每个 key 此时只有一条 record）。

`upload-engine.ts:111-114` 的 offset 逻辑不变：upload 仍然从 offset 0 读取全部未上传 records，上传成功后 saveOffset。

**关键不变量**：
> 在 sync 完成后的任意时刻，queue 中每个 key `(source, model, hour_start, device_id)` 只有一条 record，其值等于原始日志中该 key 的真实 token 总量。

**为什么用 MAX 而不是 SUM**：

| 场景 | SUM | MAX |
|------|-----|-----|
| 正常增量 sync（new key，old 中没有） | 正确 | 正确 |
| 正常增量 sync（existing key，new > old） | 错误（old + new = 2x） | **正确**（取 new） |
| Cursor reset 后全量重扫 | 错误（old + new = 2x） | **正确**（取 new = 全量值） |
| Upload 失败后重复 sync | 错误（累积） | **正确**（幂等） |

SUM 只在 "old 和 new 永远不重叠" 的假设下正确。MAX 在所有场景下都正确，因为 token 是单调递增的累积量。

**修改文件**：
- `packages/cli/src/commands/sync.ts` — 尾部 queue 写入逻辑改为 read-merge(MAX)-overwrite
- `packages/cli/src/storage/base-queue.ts` — 新增 `overwrite()` 方法
- `packages/cli/src/commands/upload.ts` — `aggregateRecords()` 保留作为 defense-in-depth

**验证**：
- L1 单元测试：cursor reset + 二次 sync → queue 中每个 key 只有一条 record，值不膨胀
- L1 单元测试：sync 后 upload 失败 → 再次 sync → queue 值仍然正确
- L1 单元测试：增量 sync（cursor 存在）→ 旧 unread records 与新 records 正确合并

### Step 2: `pew reset` CLI Command

**目标**：一条命令清除所有会导致 token inflation 的本地状态，然后全量重建。

**安全约束**：
- **绝不触碰用户原始数据**（`~/.claude/`, `~/.gemini/`, `~/.local/share/opencode/`, `~/.openclaw/` 等）
- 只删除 pew 自身的状态文件（`~/.config/pew/` 下）

**清理范围**（6 个文件）：

| 文件 | 用途 |
|------|------|
| `cursors.json` | Token sync 游标 |
| `queue.jsonl` | Token upload 队列 |
| `queue.state.json` | Token upload offset |
| `session-cursors.json` | Session sync 游标 |
| `session-queue.jsonl` | Session upload 队列 |
| `session-queue.state.json` | Session upload offset |

**行为**：

```
pew reset [--dev]
  1. 删除上述 6 个文件（不存在则跳过，不报错）
  2. 打印已清除的文件列表
  3. 提示用户执行 pew sync 重建数据
```

`pew reset` 只负责清理，不自动触发 sync + upload。用户手动执行 `pew sync` 来重建（sync 默认 `--upload`），这样用户对整个流程有完整控制。

**修改文件**：
- `packages/cli/src/commands/reset.ts` — 新建
- `packages/cli/src/cli.ts` — 注册 `reset` 子命令

### Step 3: Version Gate (Server-Side Defense)

**目标**：拒绝未修复 bug 的老版本客户端上传，防止膨胀值写入 D1。

**为什么需要**：客户端 bug 修复后，老版本 CLI 仍可能运行。Worker 无法区分"正确的 1000 tokens"和"4 次 cursor reset SUM 出来的 4000 tokens"——请求格式完全一样。

**实现**：

1. **CLI 端**：upload 请求添加 `X-Pew-Client-Version` header。

   ```
   headers: {
     "Content-Type": "application/json",
     "Authorization": `Bearer ${token}`,
     "X-Pew-Client-Version": "1.6.0"
   }
   ```

   版本号从 `cli.ts` 的 `meta.version` 传入 upload engine。

2. **Next.js 端**：`ingest-handler.ts` 认证通过后、校验 body 之前，检查 `X-Pew-Client-Version`：
   - 缺失 → `400: { "error": "Client version too old. Run: npx @nocoo/pew@latest && pew reset" }`
   - 低于 `MIN_CLIENT_VERSION` → 同上
   - 通过 → 继续正常流程

3. **Worker 端**：无需修改。Worker 只接受来自 Next.js 的内部请求（WORKER_SECRET 认证），版本校验在 Next.js 层完成。

**修改文件**：
- `packages/cli/src/commands/upload-engine.ts` — `sendBatchWithRetry` 添加版本 header
- `packages/web/src/lib/ingest-handler.ts` — 添加版本校验
- `packages/core/src/constants.ts` — 导出 `MIN_CLIENT_VERSION`

### Step 4: Clear D1 Data

**目标**：清除 D1 中的膨胀数据，等用户重新同步后重建正确数据。

**方案**：直接清空 `usage_records` 和 `session_records` 表数据。不做复杂的数据修复、merge、迁移判断。

```sql
DELETE FROM usage_records;
DELETE FROM session_records;
```

**时机**：Step 1-3 发布新版本、服务端版本门禁生效之后执行。确保清空后旧版本 CLI 无法再写入膨胀数据。

**恢复流程**：每个用户升级新版 CLI → `pew reset` → `pew sync`。

### Step 5: Share Device ID Across dev/prod

**目标**：同一台机器 dev 和 prod 使用相同的 device ID。

**方案**：将 `deviceId` 存储在独立的 `device.json` 文件中，不区分 dev/prod。`config.json` 和 `config.dev.json` 只存 `token`。

**修改文件**：
- `packages/cli/src/config/manager.ts` — `ensureDeviceId()` 改为读写 `device.json`
- `packages/core/src/types.ts` — `PewConfig` 中移除 `deviceId` 字段（或保留向后兼容）

### Execution Order

1. Step 1 (fix token queue semantics) → commit
2. Step 2 (`pew reset` command) → commit
3. Step 3 (version gate) → commit
4. Step 5 (share device ID) → commit
5. Bump version to 1.6.0, `bun run build`, `npm publish`
6. Deploy web (version gate live)
7. Step 4 (clear D1 data)
8. Announce: "升级后执行 `pew reset` 再 `pew sync`"
