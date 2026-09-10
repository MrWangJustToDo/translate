## Context

`@my-agent/core` 目前没有统一的事件抽象，而是 **7 套机制并存**（见 proposal）：`AgentTelemetryBus`、`ExtensionEventBus`、领域 `Emitter`、`AgentSession` channel bus、`streaming-callback` 全局注册表、`ExtensionUI` pub/sub、`AgentLog` bridge。同一个 session channel 的末端来源在 4 种风格间切换，由此产生了 `broadcastPostCommand`、`mode` 半残、lifecycle 过滤器遗漏、重放语义不一致、`messages` re-subscribe hack、同一 `tool_call_id` 双发 `agent:tool-start` 等一连串问题。

**约束与边界（来自现状调研）：**

1. **外部消费者只依赖 `AgentSession` channel 协议**。`packages/{app,cli,server,extension,playground,im-bridge,mcp-server}` 对 `AgentTelemetryBus` / `ExtensionEventBus` / streaming-callback / `ExtensionUI` 的引用为 **0**；它们只通过 `session.subscribe(handler, {channels})` 与 `session.getSnapshot()` 消费事件。
2. **`packages/app/scripts/validate-core-imports.mjs` 强制 session-only 边界**：app 不得 import `AgentManager` / `ManagedAgent` / `TodoManager` / `AgentLog` 等 core 内部对象。统一 bus 不能把内部对象泄漏到 app。
3. **SSE 线协议是外部契约**：`{channel,payload,ts}` 信封 + `messages` 的 `full`/`patch` delta（`remote-session-transport` spec 锁定），im-bridge / server validate 脚本依赖它。
4. **扩展面向的 hook 名称是冻结契约**：`tool:before:*` / `tool:after:*` / `tool:error:*`、`before_agent_start`、`session:start` / `session:shutdown`，且 `ctx.registerInterceptor` / `ctx.events.on` / `ctx.ui.*` 被 core 内置扩展与 `examples/extensions` 使用。
5. **`agent-lifecycle-events` spec** 已用 "AgentEventBus" 描述当前 `AgentTelemetryBus`，并规定 Event→Log 是唯一通配消费者。

## Goals / Non-Goals

**Goals:**

- 引入统一 `AgentEventBus`，作为 core 内**唯一**的事件触发/订阅机制。
- 单一全局类型表 `AgentEvents`（module-augmentable），取代 `AgentEventType`/`AgentEventPayloadMap` 及各领域 `Emitter<…Events>`。
- 双派发模式：观察 `emit`（同步、fire-and-forget、异常隔离）与拦截 `intercept`（异步、有序、共享可变 event、cancel 短路、返回替换值）。
- 内置 `on(name | "*")`、`retain(name, provider)` 保留值、`scope(id)` 作用域路由。
- `AgentSession` channel 层重写为**纯投影**：单次订阅 + 按事件声明的 channel 路由；删除 `wireSource` 逐源特判与 `broadcastPostCommand`。
- 收敛全部 core 通知路径到 bus（领域对象、middleware、controller、service、扩展）。

**Non-Goals:**

- 不改动 `AgentSession` channel 名称、payload 形状、`subscribe({channels})` 选项、`getSnapshot()` 契约（外部消费者全部依赖它）。
- 不改动 SSE `{channel,payload,ts}` 信封与 `messages` `full`/`patch` 编码。
- 不改扩展 hook 名称与 `ctx` 扩展 API 形状（`registerInterceptor` / `events` / `ui`）。
- 不重写 compaction / plan / subagent / memory 的业务算法。
- 不处理 core 服务化路线图剩余项（TurnContext / Registry）。
- **不引入第 3 种派发模式**：awaited observer（需等待的广播，如持久化 flush / turn-stopping 屏障）、parallel fan-out（并发 await 全部监听者）、waterfall（around 中间件 + `next()`）。当前这些语义都不经 bus（持久化在 `session-journal`/`session-store`，turn 收尾在回调），故 `emit` + `intercept` 已足够；将来若确需屏障，按**加法**增模式，不推翻现有结构。

## Decisions

### D1. 一个 bus、两种派发模式（emit / intercept）

统一类 `AgentEventBus` 暴露两组方法：`emit(name, payload)`（观察）与 `intercept(name, event)`（拦截）。二者共享同一个事件注册表与同一份类型声明，但：
- 观察 `emit`：同步、按注册顺序、通知**所有**观察者、**单监听异常隔离**、无返回值；
- 拦截 `intercept`：**异步、有序、共享同一可变 event、任一拦截器置 `cancel` 即短路并返回**、可返回替换值。

**intercept 契约（硬化，5 条）：**

1. 向每个拦截器传入**同一个可变 event 对象**，按注册顺序串行执行；前者的改动后者可见。
2. 每个拦截器都被 `await`（支持异步）。
3. 任一拦截器置 `cancel`（等价于现 `skipDefault`/返回 `false`）→ **立即停止**后续拦截器并返回当前 event/替换值。
4. `tool:before:*` 等模式键按"精确匹配优先、再前缀模式"解析。
5. 返回最终 event 或其替换值给调用方。

**为什么两种模式足够**：core 真实存在的派发语义只有三类——通知、守卫/改写、汇合。前两类分别由 `emit` 与 `intercept` 承担；第三类"汇合"（如 `runner.ts:274-283` 的 `before_agent_start` 收集 turn-context sections）用 intercept 的"共享可变 event + 无人 `cancel`"即可表达，因而 `collectBeforeAgentStart` 绕过事件派发的特例被消除，**不需要第三种模式**。

**理由**：外部/UI 消费方需要 fire-and-forget 的观察语义；扩展需要能改变行为的拦截语义。把两者压成同一同步 `emit` 会破坏拦截器（异步被吞、无法短路）。
**备选**：①保留 `ExtensionEventBus` 独立（方案 B）——被否决，双轨制正是"关系描述复杂、payload 语义分裂"的根源；②增加 `collect` 第三模式——被否决，汇合可由共享可变 event 表达，多一个概念收益不抵成本；③deepseek 式 5 模式（emit/parallel/serial/bail/waterfall）——被否决，其 `parallel`/`waterfall` 语义在当前 core 无对应需求（见 Non-Goals）。

### D2. 单份全局类型表 `AgentEvents`

```ts
// types.ts —— module-augmentable，唯一事件名/载荷真源
export interface AgentEvents extends AgentEventPayloadMap {
  "agent:state": AgentL1State;
  "session:messages": UIMessage[];
  "session:usage": UsageChangeSnapshot;
  "agent:tool-start": { tool_name: string; tool_call_id: string; ... };
  "subagent:completed": { subagentId: string; summary: string; ... };
  // ... telemetry 载荷继承自 AgentEventPayloadMap，session/通道投影事件在此追加
}
```

`AgentEventType` 派生自 `AgentEvents`（`keyof AgentEvents`，含 telemetry + 投影事件全集）；`AgentEventPayloadMap` 保留为 **telemetry 事件的权威载荷表**，`AgentEvents` 通过 `extends` 继承它并追加会话/投影事件——两份表不再各自维护同名条目，新增事件仍只需改一处，编译期即校验 emit/on 双方。
**备选**：每个领域对象保留自己的 `Emitter<…Events>` 本地类型——被否决（正是当前碎片化来源）。

### D3. 拦截事件支持模式键（pattern keys）

工具名是开放集合，拦截事件名为 `tool:before:${toolName}`。因此：
- **观察事件**：使用封闭的 `AgentEvents` 类型表，名称为固定字面量；
- **拦截事件**：使用 `InterceptableEvents` 接口，键允许 `tool:before:*` 等 **后缀通配模式**，`on("tool:before:*", h)` 匹配该前缀全部工具。

`intercept(name, event)` 的 `name` 是具体 `tool:before:read_file`，运行时按"精确 → 模式"顺序解析 handler。

**理由**：保留扩展 hook 名称契约与按工具订阅能力，同时不把开放集合塞进封闭类型表。
**备选**：把 `tool:before:*` 也塞进 `AgentEvents`——不可行（工具集合运行时才可知）。

### D4. 信封与元数据归 bus，payload 保持纯类型

观察事件的 wire 形态仍是 `{ type, ts, agentId, parentId?, sessionId?, payload }`（沿用 `AgentEvent` 信封）。bus 在 `emit` 时注入 `ts` 与作用域元数据；`payload` 只承载业务字段，不含路由字段。这样 `lifecycle` channel 的 payload 形状（app 的 `tool-timing-store` 依赖）与 SSE 信封都不变。

### D5. 作用域路由取代手工 id 判定

`bus.scope(id)` 返回绑定到某个 agent/session 作用域的子 bus。作用域事件按身份路由：
- 根作用域订阅者能看到全部；
- 子作用域订阅者只收到自身（及按需上浮的子代理）事件。

取代 `local-agent-session.ts:325` 的 `event.agentId === managed.id || event.parentId === managed.id` 手工判定，也让 `subagent:*` 上浮父 agent。作用域 key 用 agent 对象本身（或稳定 id），避免字符串漂移。

**理由**：core 单进程承载多会话/多子代理，手工过滤易漏（现 lifecycle 只注册逐类型 listener）。
**备选**：保留 envelope `agentId` + 消费方过滤——被否决（当前 bug 源头之一）。

### D6. `retain(name, provider)` 统一保留值

对"有当前状态"的事件（`agent:state`、`session:todos`、`session:plan`、`session:usage`、`session:mode`、`session:extensions`、`session:mcp`、`extension:ui` status），由拥有者 `retain(name, () => currentValue)`。任何 `on(name)`（含晚订阅者）立即同步收到当前值一次，之后跟随增量。

**理由**：一举消除——`ManagedAgent.on("change")` 手工补发、`extension-ui` 逐订阅者补发、`broadcastPostCommand` 命令后补发、重放语义不一致。
**备选**：消费方各自 `getSnapshot()` 读——被否决（远程缓存 stale 的根因）。

### D7. 通配 `"*"` 订阅

`on("*", handler)` 收到作用域内所有观察事件（拦截事件不参与通配）。`event-log-bridge` 保持为唯一 core 内通配消费者。

### D8. 事件声明带 channel 元数据 → session 层单订阅路由

每个事件在注册表声明 `{ mode, channel, retained }`。`AgentSession` 层**只订阅一次**作用域 bus，按事件声明的 `channel` 投影到对应会话通道；`subscribe({channels})` 只是对该映射的过滤。

```ts
export const AGENT_EVENT_META = {
  "agent:state":      { channel: "state",     retained: true },
  "session:messages": { channel: "messages" },
  "agent:tool-start": { channel: "lifecycle" },
  "tool:chunk":       { channel: "tool" },
  // ...
} as const;
```

**理由**：`wireSource()` 的 14 段 `if (channelAllowed(...))` 特判、`lifecycle-filter.ts` 的维护清单、`mode` 寄生在 `plan`、`messages` re-subscribe 全部消失——channel 归属变成声明式数据。
**备选**：保留逐 channel 源适配器——被否决（当前碎片化核心）。

### D9. 领域对象不再持有私有 `Emitter`

`TodoManager` / `PlanModeController` / `UsageTracker` / `SummaryStreamHub` / `AgentUIChannel` / `AgentChatController` 改为持有（作用域化）bus 或绑定的 `emit` 函数，向外 emit 声明过的观察事件，并 `retain` 其当前状态。`utils/emitter.ts` 的 `Emitter` 保留为 bus 内部的同步多播底座（`DefaultAgentEventBus` 组合它），不再是对象间公共 API。

### D10. streaming-callback 注册表 → 作用域事件

`emitStreamingChunk` / `clearStreamingOutput` → bus 事件 `tool:chunk` / `tool:clear`（channel `tool`），由 agent 作用域路由。删除模块级 `Map<agentId,…>`。现有 `validate:streaming-scope` 断言的"按 agentId 隔离"改为断言作用域路由。

### D11. 扩展 API 变薄壳，底层换 bus

- `ctx.events` / `ctx.registerInterceptor` → 统一 bus 的 intercept 模式；
- `ctx.ui.*` → `extension:ui` 观察事件 + `ui` 门面（`setStatus`/`getStatus`/`notify`/`subscribe` 保留原签名）；
- 拦截器注册返回 disposable，随扩展实例 teardown 自动注销；`DefaultExtensionEventBus` / `DefaultExtensionUI` 内部实现删除。

**理由**：扩展是冻结契约，门面隔离迁移成本；共享注册表保证"一个扩展被禁用即其拦截器/UI 消失"。

### D12. 删除与保留清单

删除：`AgentTelemetryBus`、`DefaultExtensionEventBus`、`DefaultExtensionUI`、`emit-agent-telemetry`（并入 bus）、`streaming-callback` 注册表、各领域 `Emitter` 公共导出、`lifecycle-filter` 清单、`broadcastPostCommand`。
保留（改名/改实现但契约不变）：`AgentSession` 接口与 channel 契约、`AgentEvent` 信封、Event→Log bridge、扩展 `ctx` API 形状、SSE 线协议。

## Risks / Trade-offs

- **[大爆炸式替换 → 中途不可用]** → 按 Migration Plan 分阶段落地，每阶段有对应 `validate:*` 脚本；一次性在单 change 内完成，靠 core 全量 validate 基线（111）与 server/app validate 兜底。
- **[拦截异步化带来每工具调用开销]** → intercept 仅对声明为拦截模式的事件启用；无已注册拦截器时走快速路径直接返回 `defaultReturn`。
- **[retain provider 被频繁调用]** → provider 只在 `on` 时与显式失效后调用，不做轮询；值由拥有者主动 emit 更新。
- **[作用域路由语义（上浮/隔离）易错]** → 明确定义：根可见全部；子只收自身子树；`subagent:*` 上浮父；用 validate 固化多会话 + 子代理场景。
- **[破坏 session-only 边界]** → app 仍只 import `AgentSession`/Host；`AgentEvents` 类型尽量下沉为纯类型，不泄漏内部对象；`validate:core-imports` 持续把关。
- **[线协议漂移]** → `remote-session-transport` 的 SSE 信封与 messages delta 不动；仅内部投影来源变化。
- **[扩展 teardown 泄漏拦截器]** → 注册一律返回 disposable，随扩展实例注销；rel→ `validate:extension-status-owner` / `validate:extension-loader`。

## Migration Plan

1. **Bus 内核**：新增 `agent-event-bus/`（类型表 `AgentEvents`、`AGENT_EVENT_META`、`DefaultAgentEventBus`（组合 `Emitter`）、`scope`、`retain`、`*`、`intercept` 模式）；新增 `validate:agent-event-bus`。
2. **接管观察流**：`AgentManager`/`ManagedAgent` 建立 per-agent 作用域 bus；`ManagedAgent.emitEvent` 改走 bus；`agent:state` 由 `retain` 提供。删除 `AgentTelemetryBus` 与 `emit-agent-telemetry`。
3. **折叠拦截**：扩展 runner 的 `events`/`registerInterceptor`/`ui` 改为 bus 门面；迁移 `agent:extension-error`、`session:start/shutdown`、tool hooks；删除 `DefaultExtensionEventBus` / `DefaultExtensionUI`。
4. **领域对象迁移**：todo / plan / usage / summary / ui-channel / chat-controller 改 emit+retain，删除私有 `Emitter` 公共 API。
5. **streaming 注册表**：改为 `tool:chunk`/`tool:clear` 作用域事件。
6. **session 投影重写**：`local-agent-session.ts` 单订阅 + 声明式 channel 路由；删除 `wireSource` 特判、`broadcastPostCommand`、`lifecycle-filter`；`mode`/`extensions`/`mcp` 变为正常事件 + retain。
7. **Event→Log 与过滤**：bridge 改接统一 bus 通配；更新 `DEFAULT_EVENT_LOG_RULES`。
8. **消费方与验证**：core 内置扩展 / examples 适配门面；更新 core / server / app validate 脚本与 `ARCHITECTURE.md`。
9. **收尾**：删除死代码与旧导出，跑 `pnpm typecheck`、`pnpm build:core` 及受影响包构建、core 全量 validate、server/app validate。

**回滚**：单 change 单批次提交；回滚即整体 revert。

## Open Questions

- `AgentSession` channel 是否要把当前的 `channel` 名收敛为事件名（如 `state` ← `agent:state`）？本设计倾向**保留现有 channel 名**，仅内部事件名变化。
- `ExtensionUI` 是否保留为独立门面，还是直接以 `extension:ui` 事件 + 纯函数 helper 暴露？倾向保留门面（冻结契约、迁移成本低）。
- 子代理事件上浮是否默认开启，还是显式 `scope(id, { includeDescendants })`？倾向默认上浮 `subagent:*`。
