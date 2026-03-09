# 10. Tracker / Coordinator 薄层架构计划

## 背景

当前 `pew` 的方向是对的：

- parser 基本独立
- token sync 与 session sync 已经拆开
- OpenCode SQLite 与 Codex 的主要来源 gap 已补齐

但如果下一步直接把 tracker / notify 逻辑塞进现有 `sync.ts` / `session-sync.ts`，架构会很快变胖，并重演 `vibeusage` 的问题：

- 触发层、发现层、解析层、上传层耦合
- 重复通知时容易并发重复同步
- source 能力分散在多个 command 中，容易漂移
- debug 时难以知道“为什么这次 sync 跑了、扫了哪些源、跳过了什么、为什么没入队”

因此，后续演进不应该是“继续增强 sync”，而应该是：

1. 增加一个薄的 tracker / coordinator 层
2. 把 discovery 与 source 能力抽成 registry
3. 让 sync 退化为“执行一个明确 plan 的纯编排器”
4. 逐步走向 tracker 为主、CLI 为辅

## 目标

目标架构应满足以下约束：

- 模块化：触发、发现、采集、入队、上传、日志分层明确
- 可测试：每层都可单测，不依赖真实 hook / watcher / 网络
- 幂等：重复触发不会造成重复统计
- 可去重：允许 at-least-once 本地执行，但最终结果不重复
- 可调试：每次 sync 都能落完整 run log，解释每个 source 的行为
- 薄协调层：coordinator 只负责调度与并发控制，不做业务解析
- registry 驱动：source 能力在单一位置声明，避免分散硬编码

## 现状问题

### 1. sync 语义是 at-most-once，会丢数据

当前 token / session sync 都是：

1. 先保存 cursor
2. 再写 queue

这个策略避免了重复写，但代价是：

- 如果进程在 cursor 持久化之后崩溃
- 本轮增量会永久丢失

对于手动 CLI，这只是 tradeoff；对长期运行的 tracker，这会成为系统性漏数。

### 2. 缺少统一 coordinator

当前没有独立的调度层来处理：

- 重复 notify 合并
- 运行中锁
- 同步节流
- sync 请求排队
- “已有 sync 在跑时，只标记 dirty，结束后再补一轮”

如果直接加 tracker，多次 hook 触发会造成重复执行和状态竞争。

### 3. discovery 重复且逐渐分叉

当前 token sync 与 session sync 各自做一轮：

- source discovery
- 文件遍历
- 进度汇报
- 跳过逻辑

这会带来两个问题：

- 同一轮 sync 内重复扫描磁盘
- source 规则容易在两个 orchestrator 中漂移

### 4. source 能力没有 registry

目前 source 相关信息分散在多处：

- 默认路径
- discovery 逻辑
- token parser
- session parser
- 状态展示
- feature flag

这已经导致过 `source 已接入 sync，但 status 漏掉` 这种问题。后续再加 tracker / hook install / health check，只会更难维护。

### 5. 缺少结构化 run log

现在有 progress callback，但没有完整的本地 run 记录。排查问题时难以回答：

- 是谁触发了 sync
- 这次 plan 包含哪些 source
- 哪些 source 被跳过
- 哪些 cursor 被推进
- 哪些 records 被 dedup
- 为什么某个来源没有产出

## 目标架构

建议收敛为六层：

1. Trigger Layer
2. Coordinator Layer
3. Discovery / Plan Layer
4. Collector Layer
5. Queue / State Layer
6. Upload Layer

其中：

- `Trigger` 只负责发起“需要同步”的信号
- `Coordinator` 只负责调度、节流、锁、run 生命周期
- `Discovery / Plan` 只负责生成本轮 `ScanPlan`
- `Collector` 只负责把 `ScanPlan` 转成 token/session changes
- `Queue / State` 负责 durable state、cursor、去重键
- `Upload` 只负责消费 queue 并上报

### 一、Trigger Layer

职责：

- 接收 CLI 手动触发
- 接收 hook / plugin / notify 触发
- 可选接收定时轮询触发

输出：

- 统一的 `SyncTrigger`

建议结构：

```ts
type SyncTrigger =
  | { kind: "manual"; command: "sync" | "sync --upload" }
  | { kind: "notify"; source: Source; fileHint?: string | null }
  | { kind: "startup" }
  | { kind: "scheduled" };
```

要求：

- Trigger 不直接调用 parser
- Trigger 不直接写 cursor / queue
- Trigger 只把事件交给 coordinator

### 二、Coordinator Layer

这是新增的薄层，也是下一阶段的核心。

职责：

- 单实例互斥锁
- debounce / throttle
- 合并重复触发
- 决定是否立即跑，或标记 `dirty`
- 为每次执行生成 `runId`
- 记录 run log 生命周期

不做的事情：

- 不负责解析具体 source
- 不负责拼 token bucket
- 不直接上传 API

建议能力：

1. `acquireRunLock()`
2. `enqueueTrigger(trigger)`
3. `coalescePendingTriggers()`
4. `buildRunContext()`
5. `runPlan()`
6. `flushFollowupRunIfDirty()`

建议语义：

- 如果当前无运行中的 sync：立即启动
- 如果当前已有 sync：只记录 trigger，并把 `dirty = true`
- 当前 run 结束后，如果 `dirty = true`，立即再跑一轮

这套机制比简单 throttle 更稳，因为它不会丢最后一次变化。

### 三、Discovery / Plan Layer

这一层把“本轮要做什么”从 orchestrator 里抽出来。

输入：

- `RunContext`
- 当前 source registry
- 上轮 state 摘要
- trigger hints

输出：

- `ScanPlan`

建议结构：

```ts
interface ScanPlan {
  runId: string;
  triggeredBy: SyncTrigger[];
  tokenTasks: SourceTask[];
  sessionTasks: SourceTask[];
  createdAt: string;
}

interface SourceTask {
  source: Source;
  capability: "tokens" | "sessions";
  inputs: DiscoveryInput[];
  reason: "manual-full" | "notify-hint" | "scheduled" | "dirty-followup";
}
```

收益：

- token / session 共用同一次 discovery 结果
- CLI 和 tracker 走同一个 plan builder
- 测试可以直接断言“给定 trigger，plan 是否正确”

### 四、Collector Layer

Collector 只消费 `SourceTask`，不关心是谁触发的。

建议拆成两类接口：

```ts
interface TokenCollector {
  collect(task: SourceTask, state: TokenCollectorState): Promise<TokenCollectResult>;
}

interface SessionCollector {
  collect(task: SourceTask, state: SessionCollectorState): Promise<SessionCollectResult>;
}
```

返回值除了业务数据，还应该带结构化元信息：

- 扫描输入数
- 实际读取数
- 跳过数
- dedup 数
- 新 cursor 草案
- warning 列表

这样 coordinator 和日志系统都能复用，不必从字符串 progress 里反推。

### 五、Queue / State Layer

这一层需要从“先存 cursor 再写 queue”的 at-most-once，切到“本地至少一次 + 结果幂等”。

建议原则：

- cursor 推进不能早于 queue durable append
- queue record 必须有稳定去重键
- upload 仍然允许重复提交，但服务端 upsert 必须幂等

建议引入两个概念：

1. `Run Staging`
2. `Idempotency Key`

#### Run Staging

每次 run 先生成：

- `run.json`
- `token-records.jsonl`
- `session-records.jsonl`

全部写完后，再原子标记为 `committed`，然后才推进 cursor。

这样即使进程中断：

- 未 commit 的 run 可在下次恢复或丢弃
- 已 commit 但未 upload 的 run 可安全重放

#### Idempotency Key

建议：

- token record key: `source|model|hour_start`
- session record key: `session_key`
- run item key: `runId|recordKey`

这样本地 queue、upload 聚合、服务端 upsert 三层都能共享同一个幂等语义。

### 六、Upload Layer

Upload 不需要做大改，但应当明确职责：

- 只读 committed queue
- 不负责计算 source cursor
- 不依赖 discovery
- 保持可重试

后续如果要做自动上传，也应当由 coordinator 决定何时调用 upload，而不是由 trigger 直接触发 upload。

## Source Registry 设计

registry 是下一阶段第二个关键抽象。

目标：

- 所有 source 能力在一个地方声明
- CLI / tracker / status / diagnostics 共享同一份能力表

建议结构：

```ts
interface SourceDriver {
  source: Source;
  displayName: string;
  capabilities: {
    tokens: boolean;
    sessions: boolean;
    notify: boolean;
  };
  resolvePaths(env: NodeJS.ProcessEnv, home: string): SourcePaths;
  discover(input: DiscoverContext): Promise<DiscoveryInput[]>;
  collectTokens?: TokenCollector;
  collectSessions?: SessionCollector;
  installNotifier?: NotifierInstaller;
  classifyPath?(filePath: string, paths: SourcePaths): boolean;
}
```

这样可以统一解决：

- 路径解析
- 自定义环境变量
- `status` 源分类
- notifier 安装
- source 是否支持 token/session

也可以避免未来再出现“sync 接进去了，但 status / tracker / debug 页面没接”的漂移。

## Tracker 为主的演进路线

最终目标不是把 CLI 去掉，而是：

- tracker 作为默认入口
- CLI 作为显式控制面板和调试入口

建议阶段如下。

### 阶段 1：先补薄 coordinator

只做：

- 互斥锁
- debounce
- dirty follow-up
- runId
- run log

此阶段不改 parser 协议。

### 阶段 2：抽 discovery plan

把 token/session 的 source discovery 抽成共享 plan builder。

产出：

- `buildScanPlan(trigger, registry, state)`
- `executeTokenPlan(plan)`
- `executeSessionPlan(plan)`

### 阶段 3：引入 source registry

把路径、能力、discovery、status 分类统一迁入 registry。

此阶段完成后：

- `cli.ts` 不再手写 source 列表
- `status.ts` 不再写路径字符串判断
- tracker 安装逻辑可按 source 驱动

### 阶段 4：切到 staged queue + 幂等 run

把当前 at-most-once 改成：

- run staging
- committed queue
- cursor after commit

这是保证 tracker 长期稳定的必要步骤。

### 阶段 5：实现 notifier / tracker

每个 source 只提供“唤醒”能力：

- Claude hook
- OpenCode plugin
- OpenClaw hook
- 未来可选 Codex / Gemini 的 watcher 或 wrapper

统一落到：

- `pew tracker notify --source codex`
- `pew tracker notify --source opencode --file <path>`

真正的同步仍然由 coordinator 决定是否立即执行。

### 阶段 6：默认以 tracker 驱动，CLI 只做手动补扫

此时：

- 日常靠 tracker 驱动增量同步
- `pew sync` 只作为手动全量/补扫入口
- `pew status` / `pew doctor` 用 registry + run log 做诊断

## 日志与调试设计

后续必须补完整 run log，否则 tracker 架构一旦有问题很难排查。

建议每次 run 写一个结构化日志文件：

`~/.config/pew/runs/<runId>.json`

建议内容：

```json
{
  "runId": "2026-03-09T12-00-00.123Z_abcd",
  "triggers": [
    { "kind": "notify", "source": "opencode" },
    { "kind": "notify", "source": "opencode" }
  ],
  "plan": {
    "tokenTasks": 3,
    "sessionTasks": 3
  },
  "sources": {
    "opencode": {
      "discovered": 42,
      "parsed": 3,
      "skipped": 39,
      "emittedTokenRecords": 2,
      "emittedSessionRecords": 1,
      "warnings": []
    }
  },
  "queue": {
    "tokenCommitted": 2,
    "sessionCommitted": 1
  },
  "status": "success"
}
```

收益：

- 可以解释为什么某次 notify 没产出
- 可以复盘 dedup 是否生效
- 可以观察频繁触发是否被合并
- 可以支持 `pew doctor` / `pew runs` / `pew debug run <id>`

## 去重与幂等策略

需要明确区分三件事：

1. Trigger 去重
2. 本地 queue 幂等
3. 服务端 upsert 幂等

### Trigger 去重

目标：

- 避免 1 秒内 20 次 hook 导致 20 次 sync

机制：

- debounce 窗口
- 合并相同 source 的重复 trigger
- running 时只标记 dirty

### 本地 queue 幂等

目标：

- 同一 run 崩溃重试不放大数据

机制：

- staged run
- record key
- commit 后再推进 cursor

### 服务端 upsert 幂等

目标：

- 本地重复上传不会放大

机制：

- token 按 `source + model + hour_start` overwrite/upsert
- session 按 `session_key` + `snapshot_at` 单调覆盖

## 测试策略

如果要保持“更现代、更可测试”，测试需要跟着分层，而不是只写 end-to-end sync 大杂烩测试。

建议拆为五类：

### 1. Coordinator 单测

覆盖：

- 重复 notify 合并
- 运行中收到 notify 时只标记 dirty
- run 结束后自动补一轮
- lock 被占用时行为正确

### 2. Plan Builder 单测

覆盖：

- manual trigger 生成 full plan
- notify trigger 生成 targeted plan
- SQLite / JSON source 同时存在时计划正确

### 3. Source Registry 单测

覆盖：

- 各 source 默认路径解析
- 环境变量覆盖
- `classifyPath`
- notifier 安装能力声明

### 4. Collector 单测

覆盖：

- 每个 source 的 token/session collect result
- cursor 推进草案
- warning 和 dedup 元数据

### 5. Run Recovery / Idempotency 集成测试

覆盖：

- queue commit 前崩溃
- queue commit 后 upload 前崩溃
- 同一 run 重放
- 并发 notify 不重复记账

## 与 vibeusage 的取舍

应当吸收 `vibeusage` 的优点，但不要复制它的胖 sync：

应吸收的点：

- tracker 驱动增量同步
- notify 只负责唤醒，不直接上传
- 本地 queue + 后台上传的分层

不应复制的点：

- 把所有 source / trigger / upload / progress 堆进一个巨型 sync
- 让 source 能力散落在多个命令和脚本里
- 缺少结构化 run log，导致问题依赖人工推测

## 推荐落地顺序

建议按这个顺序实施：

1. 新增 coordinator 模块，但先只接 CLI `sync`
2. 为每次 sync 生成 run log
3. 抽出共享 discovery / plan builder
4. 抽出 source registry
5. 调整 queue/cursor 语义为 staged commit
6. 最后接入 tracker / notify

这个顺序的好处是：

- 每一步都可测试
- 不会一次性重写全部 sync
- 可以持续验证行为不回归

## 最终结论

下一阶段最重要的不是“把 tracker 接上”，而是先把架构收敛到：

- `Trigger` 只唤醒
- `Coordinator` 只调度
- `Plan` 只描述本轮工作
- `Registry` 只声明 source 能力
- `Collector` 只产生结果与 cursor 草案
- `Queue/State` 负责 durable commit 与幂等

在这个基础上，`pew` 才能真正走向：

- tracker 为主
- CLI 为辅
- 可恢复
- 可去重
- 可调试
- 不臃肿

