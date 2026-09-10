## Why

`@my-agent/core` 目前并存 **7 套**事件/通知机制：`AgentTelemetryBus`、`ExtensionEventBus`、领域 `Emitter`、`AgentSession` channel bus、`streaming-callback` 全局注册表、`ExtensionUI` pub/sub、`AgentLog` event→log bridge。同一个 session channel 的数据来源在 4 种风格之间切换，导致：

- `broadcastPostCommand` 只能在命令后手工补发 3 个 channel（`extensions`/`mcp`/`mode`），其余状态变更对远程订阅者不可见；
- `mode` channel 半残（寄生在 `plan` 源里，只订阅 `mode` 收不到），且 `if (channel === "plan")` 是恒真的 vestigial guard；
- `lifecycle` 过滤器遗漏 `agent:tool-approval-resolved`、错误类事件；
- 重放语义不一致（只有 `ManagedAgent.on("change")` 重放当前值，其余源都不重放），消费者必须逐源记忆；
- `messages` 需要 re-subscribe hack（`managed.on("ui")` 拆装监听）来解决生命周期顺序；
- 事件发射散落在 middleware / controller / service / 领域对象四层，没有单一登记处（甚至有同一 `tool_call_id` 双发 `agent:tool-start`）。

根因是缺少一个**统一的事件触发/订阅机制**。本变更引入统一 `AgentEventBus` 并以此重建事件层，之后的事件相关缺陷修复都建立在这套机制之上。

## What Changes

- 引入统一的 **`AgentEventBus`**：
  - 单一全局类型表 `AgentEvents`（module-augmentable），取代散落的 `AgentEventType` / `AgentEventPayloadMap` / 各家 `Emitter<…Events>` 类型；
  - **双派发模式**：观察 `emit`（同步、fire-and-forget、单监听异常隔离）与拦截 `intercept`（异步、按注册顺序、可 `next()` 委派 / 短路 / 改写 payload）；
  - 内置 **通配 `"*"`** 订阅（Event→Log bridge 等全局消费者）、**`retain(name, provider)`** 保留值（晚订阅者立刻收到当前值，取代手工补发与逐源重放）、**`scope(id)`** 作用域路由（按 agent/session 过滤，取代手工 `agentId`/`parentId` 判定）。
- 用统一 bus **取代**：`AgentTelemetryBus`、`ExtensionEventBus`、仅用于通知的领域 `Emitter`、`streaming-callback` 全局注册表、`ExtensionUI` pub/sub。
- `AgentSession` channel 层重写为**纯投影适配器**：每个 channel 订阅 bus（或读取 retain 值），删除 `wireSource` 的逐源特判与 `broadcastPostCommand`。
- 事件发射收敛到统一 emit 点（领域对象持有 bus 并 emit，而非各自 `Emitter`）；`event-log-bridge` 保持为 `"*"` 订阅者。
- **BREAKING**：内部事件 API 全面替换，**不保留**旧 `AgentTelemetryBus` / `ExtensionEventBus` / 领域 `Emitter` 的兼容层。扩展面向的 hook 名称（`tool:before:*` / `tool:after:*` / `tool:error:*`、`before_agent_start`、`session:start` / `session:shutdown`）保持不变，但底层实现切换到统一 bus。
- 本变更聚焦"统一机制 + 事件层重建"，不作为独立目标去逐个修补业务缺陷；但机制落地后，`broadcastPostCommand`、`mode` 半残、lifecycle 遗漏、重放不一致等**随之自然消除**。

## Capabilities

### New Capabilities

- `agent-event-bus`: 统一 typed 事件系统——全局 `AgentEvents` 类型表、`emit`（观察）/ `intercept`（拦截）双模式、`on`（含通配）、`retain` 保留值、`scope` 作用域路由，以及基于该 bus 的 `AgentSession` channel 投影契约。

### Modified Capabilities

- `agent-lifecycle-events`: 事件总线由 `AgentTelemetryBus` + `ExtensionEventBus` 双轨改为统一 `AgentEventBus`；更新事件发射契约、观察/拦截分工，以及 Event→Log 作为唯一通配消费者的描述。

## Impact

| 区域 | 变更 |
|------|------|
| `packages/core/src/utils/` | `Emitter` 保留为 bus 内部多播底座（或并入 bus 实现） |
| `packages/core/src/managers/telemetry/` | `AgentTelemetryBus` → `AgentEventBus`；`emit-agent-telemetry` / `event-log-bridge` 改接统一 bus |
| `packages/core/src/agent/extension/` | `DefaultExtensionEventBus` 并入统一 bus 的 intercept 模式；`DefaultExtensionUI` **保留为统一 bus 门面**（`notify`→`bus.emit("extension:ui")`、`subscribe`→`bus.on` 过滤，保持 `ctx.ui` 形状不变） |
| `packages/core/src/agent-session/` | `local-agent-session.ts` 重写为投影适配器；删除 `broadcastPostCommand`、`wireSource` 特判 |
| 领域对象 | `todo-manager` / `plan-mode-controller` / `usage-tracker` / `summary-stream-hub` / `ui-channel` / `agent-chat-controller` 改为向 bus emit |
| `packages/core/src/agent/tools/util/streaming-callback.ts` | 全局注册表 → 作用域化 bus 事件 |
| `packages/core/src/managers/` | `managed-agent` / `agent-manager` / controllers / middleware / services 统一通过 bus emit |
| `packages/app` / `cli` / `server` / `extension` / `im-bridge` | 消费方从旧 API 迁移到统一 bus / session channel |
| 文档 | `ARCHITECTURE.md`、`AGENTS.md` 事件模型章节重写 |
