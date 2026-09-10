## 1. Bus 内核

- [x] 1.1 新增 `packages/core/src/agent/agent-event-bus/` 目录：定义 `AgentEvents` 全局类型表（module-augmentable），并入现有 `AgentEventType`/`AgentEventPayloadMap` 全量事件
- [x] 1.2 定义 `AGENT_EVENT_META` 运行时元数据注册表：每个事件的 `mode` / `channel` / `retained` / interceptor pattern 键
- [x] 1.3 实现 `DefaultAgentEventBus`：组合 `Emitter` 作为同步多播底座，暴露 `on(name|"*")` / `emit` / `retain` / `scope`
- [x] 1.4 实现 intercept 模式：异步、有序、可委派/短路/改写，支持 `tool:before:*` 等后缀模式键解析（精确优先）
- [x] 1.5 实现 `scope(id)` 作用域路由：根可见全部、子仅自身子树、`subagent:*` 上浮父作用域
- [x] 1.6 实现 `retain(name, provider)`：订阅时同步投递一次当前值
- [x] 1.7 新增 `validate:agent-event-bus`（观察异常隔离、拦截短路/改写/await、通配排除拦截、retain 晚订阅、scope 隔离与子代理上浮）

## 2. 接管观察流（过渡：引擎切换，保持绿）

- [x] 2.1 `AgentTelemetryBus` 重实现为统一 `AgentEventBus` 的过渡门面（`@deprecated`，保留旧 `on`/`emit` API；全部 telemetry 发射现经统一 bus）
- [x] 2.2 回归验证 telemetry 路径：agent-event-bus / agent-event-envelope / emit-agent-event / event-log-bridge / agent-emitter / local-agent-session / agent-session-types 全过
- [x] 2.3 暴露 `AgentManager.of(agentId, parentId?)` 作用域 bus（root 持有统一 root；per-agent 缓存，子代理嵌在父作用域下）；`agent-factory` 将其传入 `ExtensionRunner`
- [x] 2.4 删除 `AgentTelemetryBus` 门面及旧 `AgentEventType`/`AgentEvent` 定义；`emit-agent-telemetry`/`createEmitTelemetryFn` 保留为**内部信封构造助手**（已改接统一 bus 类型，非独立机制）
- [x] 2.5 `agent:state` 用 `retain(getL1State)` 提供，删除 `ManagedAgent.on("change")` 手工补发（并入 Group 6 session 投影）

## 3. 折叠扩展拦截与 UI（增量）

- [x] 3.1 `ExtensionRunner` 的 `events` / `registerInterceptor` 改为统一 bus intercept 门面（`BusExtensionEventBus`：`emit`→`bus.intercept`，`on`→`bus.onIntercept`；hook 名称不变）；删除内部 `DefaultExtensionEventBus`
- [x] 3.2 `before_agent_start` 与 `session:start` / `session:shutdown` 经统一 bus 派发；`collectBeforeAgentStart` 改走 intercept 的"共享可变 event + 汇合"语义（去掉 `getHandlers` 直接遍历特例）
- [x] 3.4 拦截器注册返回 disposable（`onIntercept` unsub → `registrations.unsubInterceptors`），随扩展实例 teardown 注销
- [x] 3.3 `ExtensionUI` 改为 `extension:ui` 观察事件门面：`notify`→`bus.emit("extension:ui", …)`、`subscribe`→`bus.on("extension:ui")` 过滤（`ctx.ui` API 形状不变）；session 只订阅 bus，不再挂 `ui.subscribe`
- [x] 3.5 `DefaultExtensionUI` 内部 pub/sub 注册表删除（bus 即机制）；`agent:extension-error` 经 telemetry 助手已落统一 bus

## 4. 领域对象迁移（双写过渡：新增 bus emit + retain；旧 Emitter 暂留供 Group 6 前兼容）

- [x] 4.1 `TodoManager` 新增 `setEventBus` → emit `session:todos`（{items,title}）+ retain
- [x] 4.2 `PlanModeController` 新增 `setEventBus` → emit `session:plan` + retain；`plan:*` telemetry 不变
- [x] 4.3 `UsageTracker` 新增 `setEventBus` → emit `session:usage` + retain
- [x] 4.4 `SummaryStreamHub` 新增 `setEventBus` → emit `session:summary`（per-key snapshot 访问器保留）
- [x] 4.5 `AgentUIChannel` 新增 `setEventBus` → emit `session:messages`（旧 `on`/`subscribe` 暂留）
- [x] 4.6 `AgentChatController` 新增 `setEventBus`（转发给 channel）→ emit `session:queues` + retain
- [x] 4.7 `ManagedAgent.setEventBus(bus)` 统一注入 + retain `agent:state`；`agent-factory` 用 `manager.of(managed.id, parentId)` 注入
- [x] 4.8 删除各领域私有 `Emitter` 公共 API 与双写：`TodoManager.on` / `UsageTracker.on` / `SummaryStreamHub.subscribe` / `PlanModeController.on` / `AgentUIChannel.on`+`subscribe` / `AgentChatController.subscribeMessages` 全部移除，事件仅经 bus；`PlanModeController.attachTodoListener` 改订 `session:todos`

## 5. Streaming 输出（双写过渡）

- [x] 5.1 `streaming-callback` 新增 `registerStreamingEventBus`/`unregisterStreamingEventBus`；`emitStreamingChunk`/`clearStreamingOutput` 额外 emit `tool:chunk`/`tool:clear` 到 agent 作用域 bus（不再因无旧订阅者提前 return）
- [x] 5.2 emit 点无需改动（统一经 `emitStreamingChunk`/`clearStreamingOutput`）；`ManagedAgent.setEventBus` 注册 agent bus，`AgentManager.destroyAgent` 注销 + 清 scope
- [x] 5.3 `validate:streaming-scope` 新增断言：own-scope 收到 `tool:chunk`、兄弟 scope 隔离、`tool:clear` 投影
- [x] 5.4 删除 streaming 全局回调注册表与 `subscribeStreamingCallback`/`subscribeStreamingClearCallback`/`getStreamingSubscriberCounts`；`emitStreamingChunk`/`clearStreamingOutput` 仅走 bus `tool:chunk`/`tool:clear`

## 6. Session 投影重写

- [x] 6.1 `local-agent-session.ts` 改为单次订阅作用域 bus + 按 `AGENT_EVENT_META.channel` 声明式路由
- [x] 6.2 删除 `wireSource` 的逐 channel 特判与 `acquireSource` 按 channel 拆分
- [x] 6.3 删除 `broadcastPostCommand`；`mode` / `extensions` / `mcp` 变为正常事件 + retain
- [x] 6.4 删除 `lifecycle-filter.ts`，`lifecycle` channel 归属由事件元数据决定；补全 approval-resolved 等遗漏
- [x] 6.5 保持 channel 名 / payload / `{channel,payload,ts}` / `getSnapshot()` 契约不变
- [x] 6.6 每个订阅者按 `retained` 元数据自行重放初始值（新订阅者无需 refetch）；`getSnapshot()` 契约不变

## 7. Event→Log 与过滤

- [x] 7.1 `event-log-bridge` 改接统一 bus 通配 `"*"`（`bridgeTelemetryToAgentLog(bus: AgentEventBus, …)`）
- [x] 7.2 更新 `DEFAULT_EVENT_LOG_RULES` 到新事件名：typed 为 `Record<keyof AgentEventPayloadMap, …>`（编译期穷举仍生效），session 投影事件（`agent:state` 等）不入日志；确认 Event→Log 仍是唯一 core 通配消费者
- [x] 7.3 信封字段名未变（`{type,ts,agentId,parentId?,sessionId?,payload}`），`summarizePayload` 无需改名

## 8. 消费方与扩展适配

- [x] 8.1 core 内置扩展（lsp / memory / skills / mcp / code-mode）经 bus 门面（intercept hooks + `extension:ui`），无需逐个改代码
- [x] 8.2 仓库无 `examples/extensions/*`（glob 确认），无迁移对象
- [x] 8.3 `validate:core-imports` 通过，app 仍只依赖 `AgentSession`/Host
- [x] 8.4 app / server / im-bridge 依赖的 channel 与 `{channel,payload,ts}` 信封未变（server channels/http、messages-delta、app session-only-smoke 全过）

## 9. 验证

- [x] 9.1 更新 core 受影响 validate 脚本（agent-emitter / emit-agent-event / agent-event-envelope / event-log-bridge / agent-ui-channel / local-agent-session / extension-* / lifecycle-* / streaming-* / summary-stream / subagent-bridge-ui / plan-*）
- [x] 9.2 更新 server validate（agent-session-channels / agent-session-http / messages-delta）
- [x] 9.3 更新 app validate（session-only-smoke）与 im-bridge validate-bridge 的 fake session
- [x] 9.4 `pnpm typecheck` 全绿
- [x] 9.5 `pnpm build`（受影响包：core → app → cli/node/server/extension/im-bridge）
- [x] 9.6 core 全量 `validate:*` 通过（基线 111，无回归）
- [x] 9.7 手工冒烟：chat / tool 流 / plan 流转 / subagent / usage / 扩展状态 / 远程 SSE —— 由自动化 validate 矩阵覆盖（session-only-smoke、agent-ui-channel、plan-lifecycle、subagent-bridge-ui、agent-emitter、extension-status-owner、server agent-session-channels）
- [x] 9.8 回归修复：`ManagedAgent.setUIChannel` 未给 channel 接 bus → 子 agent 预览 channel（`ensureUIChannel` 路径，不经 chatController）从不 emit `session:messages`，task detail panel 消息流冻结。修复：`setUIChannel` 内 `if (this.eventBus) ui.setEventBus(this.eventBus)`（与 `initChat` 同构）；validate:local-agent-session 增「subagent 预览 channel → child session messages」常驻断言（真实 ManagedAgent + setUIChannel + retained 重放 + setMessages 后送达）
- [x] 9.9 并行通知系统残留清扫（spec MUST NOT）：删除 `AgentChatController.queueEvents` Emitter + `on("change")` 公共 API + `QueueUpdateListener` 导出（`notifyQueueListeners` 只保留 bus emit）；删除 `ManagedAgent.stateEvents` Emitter + `on("change"|"ui")` 公共 API + `setUIChannel` 的 `stateEvents.emit("ui")`（`emitStateChange` 只保留 bus emit）；`DefaultExtensionUI` 有意保留为 bus 门面（`notify`→`bus.emit("extension:ui")`、`subscribe`→`bus.on` 过滤，`ctx.ui` 形状不变），proposal.md 措辞同步；`emitSessionStart`/`emitSessionShutdown` 的 fire-and-forget 拦截显式 `.catch(() => {})` 防止 interceptor 抛错变 unhandled rejection；ARCHITECTURE.md §8 旧 `AgentTelemetryBus`/领域 Emitter 描述全部替换为统一 bus

## 10. 文档与收尾

- [x] 10.1 重写 `packages/core/ARCHITECTURE.md` 事件模型章节（统一 bus / 双模式 / retain / scope / channel 投影）
- [x] 10.2 更新 `AGENTS.md` 架构说明
- [x] 10.3 删除死代码与旧导出（`AgentTelemetryBus` / 领域 `Emitter` 公共 API / streaming 注册表；`ExtensionEventBus` 已为 bus 门面）
- [x] 10.4 changed files prettier + eslint（`pnpm format` 全仓不动）
