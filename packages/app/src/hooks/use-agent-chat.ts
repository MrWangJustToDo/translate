import { isActiveStatus } from "@my-agent/core";
import { throttle } from "lodash-es";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toRaw } from "reactivity-store";

import { bindAgentSession } from "../adapter/create-agent.js";
import { useAdapter } from "../context/adapter-context.js";
import { clearFlatMessageCache } from "../utils/message-flat-cache.js";
import { getActiveHost, resolveAgentSession } from "../utils/session-resolve.js";
import { isToolCallPart, isPendingToolApproval, parseToolInput } from "../utils/tool-part.js";

import { bindSessionLog } from "./use-agent-log.js";
import { useAgentStatus } from "./use-agent-status.js";
import { useAgent } from "./use-agent.js";
import { useCallbackRef } from "./use-callback-ref.js";
import { useConfig } from "./use-config.js";
import { useForceUpdate } from "./use-force-update.js";
import { useThinkingLine } from "./use-thinking-line.js";
import { useTodoManager } from "./use-todo-manager.js";
import { handleToolLifecycleEvent } from "./use-tool-timing-store.js";
import { getWorkSpaceInfo } from "./use-workspace-info.js";

import type { AppConfig } from "../adapter/types.js";
import type { Attachment } from "../types/attachment.js";
import type { AgentStatus, QueuedMessagesSnapshot } from "@my-agent/core";
import type { ContentPart, UIMessage } from "@tanstack/ai";

// ============================================================================
// Types
// ============================================================================

export interface SendMessageContent {
  text: string;
  files?: Attachment[];
}

export interface UseAgentChatReturn {
  messages: UIMessage[];
  sendMessage: (content: string | SendMessageContent) => Promise<void>;
  /**
   * Queue a mid-run correction (after current tool batch). Idle → sendMessage.
   *
   * NOTE: Not the default keybinding anymore. Enter (running) → followUp;
   * Option+Enter → forceSubmit. `steer` is for programmatic use where you
   * want the message delivered within the same turn (before the next LLM call).
   */
  steer: (content: string | SendMessageContent) => void;
  /** Queue a message for when the agent would stop. Idle → sendMessage. */
  followUp: (content: string | SendMessageContent) => void;
  /** Force-submit: abort current run, inject message, start new pump. */
  forceSubmit: (content: string | SendMessageContent) => void;
  queuedMessages: QueuedMessagesSnapshot;
  status: AgentStatus;
  isLoading: boolean;
  isReady: boolean;
  stop: () => void;
  clearMessages: () => void;
  setMessages: (messages: UIMessage[]) => void;
  error: Error | null;
  initLoading: boolean;
  initError: Error | null | undefined;
  addToolApprovalResponse: (options: {
    id: string;
    approved: boolean;
    reason?: string;
    isLast?: boolean;
    toolCallId?: string;
    toolName?: string;
  }) => void;
  allPendingApproval: Array<{
    id: string;
    toolName: string;
    toolCallId: string;
  }>;
  allPendingAskUser: Array<{
    toolCallId: string;
    question: string;
    options?: string[];
    multiSelect?: boolean;
  }>;
  addToolOutput: (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => void;
  /** Pause/resume status while a client tool waits for user input (`ask_user`). */
  setClientToolWaiting: (active: boolean) => void;
  /**
   * Last session persistence failure message (from `session:save-error`),
   * or empty string when none has occurred. Lets the UI surface disk-write
   * failures instead of silently dropping them.
   */
  saveError: string;
  /**
   * Persistence is owned by core (user-message / pump-complete / force).
   * Kept as a no-op for command-context compatibility until `/clear` migrates.
   */
  saveSessionFromChat: () => void;
}

function attachmentToContentPart(attachment: Attachment, imageIndex?: number): ContentPart {
  if (attachment.type === "image") {
    return {
      type: "image",
      source: { type: "url", value: attachment.dataUrl },
      metadata: {
        mediaType: attachment.mediaType,
        filename: attachment.filename,
        ...(imageIndex !== undefined ? { imageIndex } : {}),
      },
    };
  }
  return {
    type: "text",
    content: `[Attached file: ${attachment.filename}]`,
  };
}

function toChatContent(content: string | SendMessageContent): string | ContentPart[] {
  if (typeof content === "string") return content;
  if (!content.files?.length) return content.text;
  const parts: ContentPart[] = [{ type: "text", content: content.text }];
  let imageIndex = 0;
  for (const file of content.files) {
    if (file.type === "image") {
      imageIndex += 1;
      parts.push(attachmentToContentPart(file, imageIndex));
    } else {
      parts.push(attachmentToContentPart(file));
    }
  }
  return parts;
}

function isAgentLoading(status: AgentStatus): boolean {
  return isActiveStatus(status) && status !== "waiting" && status !== "awaiting_user";
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentChat(config: AppConfig): UseAgentChatReturn {
  const adapter = useAdapter();

  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState<Error | null>(null);
  // Active session is store-owned: switching the active session only flips the
  // pointer (no destroy/rebuild). Derive it here so this hook re-subscribes to
  // the new handle on switch.
  const session = toRaw(useAgent((s) => s.session));
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessagesSnapshot>({ steer: [], followUp: [] });
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [agentError, setAgentError] = useState("");
  const [saveError, setSaveError] = useState("");

  const forceUpdate = useForceUpdate({ time: 100 });
  const initIdRef = useRef(0);

  useEffect(() => {
    const currentInitId = ++initIdRef.current;

    const init = async () => {
      setInitLoading(true);
      setInitError(null);

      try {
        await getWorkSpaceInfo();
        await adapter.destroy();
        if (currentInitId !== initIdRef.current) return;

        const result = await adapter.initialize(config);
        if (currentInitId !== initIdRef.current) return;

        bindAgentSession(result.session, { useAgent }, result.host);
        // Snapshot population (messages/status/queues/todos) is NOT done here.
        // bindAgentSession activates the new session, which flips `session` and
        // triggers the session-switch effect below to repopulate UI state from its
        // snapshot — single source of truth, so init and switch share one path.
      } catch (e) {
        if (currentInitId !== initIdRef.current) return;
        setInitError(e as Error);
      }

      if (currentInitId !== initIdRef.current) return;
      setTimeout(() => {
        if (typeof process === "object") {
          import("ansi-escapes").then((pkg) => process?.stdout?.write?.(pkg.clearScreen + pkg.cursorTo(0, 0)));
        }
        setInitLoading(false);
      }, 200);
    };

    void init();

    return () => {
      bindAgentSession(null, { useAgent }, null);
      void adapter.destroy();
    };
    // Deliberately NOT depending on config.model/baseURL/style/apiKey (or the whole
    // `config` object): createAgentFromConfig writes the resolved provider values
    // back into the config store DURING adapter.initialize (remote-provider mode
    // always changes them). Depending on them here would flip the effect mid-init
    // and rebuild the session, racing with the stale init's host.create — the old
    // session ends up registered too (Header shows "2 sessions"). Only rebuild for
    // inputs that genuinely require a fresh session.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `config` intentionally excluded; see comment above.
  }, [config.systemPrompt, config.maxIterations, config.mcpConfigPath, adapter]);

  useEffect(() => {
    if (!session) return;

    // Session switch: repopulate local state from the newly active session's
    // snapshot so the UI reflects its transcript/status/todos instead of the
    // previous session's (no destroy/rebuild — the live agent keeps running).
    const snap = session.getSnapshot();
    setMessages(snap.messages);
    setStatus(snap.status);
    setAgentError(snap.error);
    useAgentStatus.getActions().setStatus(snap.status);
    setQueuedMessages(snap.queues);
    useTodoManager.getActions().setFromSession(snap.todos, snap.todosTitle);

    // Resume-session linkage: if the restored session was using a model that the
    // loaded models.json knows about, re-dispatch model.set so the live agent
    // re-resolves that model instead of keeping the config default. Unknown models
    // (or no models.json) are left untouched.
    if (snap.model) {
      const modelsConfig = useConfig.getReadonlyState().modelsConfig;
      const found = modelsConfig?.entries[modelsConfig.active.entryIndex];
      if (found && found.models.includes(snap.model)) {
        void session.dispatch({ type: "model.set", model: snap.model });
      }
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;

    const setAgentStatus = useAgentStatus.getActions().setStatus;
    const unsubLog = bindSessionLog(session);

    const updateUi = throttle((next: UIMessage[]) => {
      setMessages(next);
    }, 60);

    const unsub = session.subscribe(
      (event) => {
        if (event.channel === "messages") {
          updateUi(event.payload);
          return;
        }
        if (event.channel === "queues") {
          setQueuedMessages(event.payload);
          return;
        }
        if (event.channel === "state") {
          setStatus(event.payload.status);
          setAgentError(event.payload.error);
          setAgentStatus(event.payload.status);
          forceUpdate();
          return;
        }
        if (event.channel === "todos") {
          useTodoManager.getActions().setFromSession(event.payload.items, event.payload.title);
          return;
        }
        if (event.channel === "lifecycle") {
          const payload = event.payload;
          if (payload.type === "session:save-error") {
            setSaveError(payload.payload?.error ?? "Session save failed");
            return;
          }
          handleToolLifecycleEvent(payload);
        }
      },
      { channels: ["messages", "queues", "state", "todos", "lifecycle"] }
    );

    return () => {
      unsub();
      unsubLog();
    };
  }, [session, forceUpdate]);

  useEffect(() => {
    let latestThinking = "";
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (let j = msg.parts.length - 1; j >= 0; j--) {
        const part = msg.parts[j];
        if (part.type === "thinking") {
          const content = part.content ?? "";
          if (content.length > 0) {
            const lines = content.split("\n").filter((l) => l.trim().length > 0);
            latestThinking = lines.length > 0 ? lines[lines.length - 1] : "";
          }
          break;
        }
      }
      if (latestThinking) break;
    }
    useThinkingLine.getActions().setContent(latestThinking);
  }, [messages]);

  const error = agentError ? new Error(agentError) : null;
  const isLoading = isAgentLoading(status);

  const saveSessionFromChat = useCallbackRef(() => {
    // Core owns session disk writes; slash `/clear` still calls this until §3.3.
  });

  const stop = useCallback(() => {
    const host = getActiveHost();
    if (session && host) {
      const activeChildren = session.getSnapshot().subagents.filter((child) => isActiveStatus(child.status));
      if (activeChildren.length > 0) {
        for (const child of activeChildren) {
          void resolveAgentSession(child.id)?.dispatch({ type: "stop" });
        }
        forceUpdate();
        return;
      }
    }
    void session?.dispatch({ type: "stop" });
    forceUpdate();
  }, [session, forceUpdate]);

  const sendMessage = useCallback(
    async (content: string | SendMessageContent) => {
      if (!session) return;
      await session.dispatch({ type: "send", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const steer = useCallback(
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "steer", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const followUp = useCallback(
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "followUp", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const forceSubmit = useCallback(
    (content: string | SendMessageContent) => {
      if (!session) return;
      void session.dispatch({ type: "forceSubmit", content: toChatContent(content) });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const clearMessages = useCallback(() => {
    void session?.dispatch({ type: "clear" });
    clearFlatMessageCache();
    setMessages([]);
    setQueuedMessages({ steer: [], followUp: [] });
  }, [session]);

  const addToolApprovalResponse = useCallback(
    async (options: {
      id: string;
      approved: boolean;
      reason?: string;
      isLast?: boolean;
      toolCallId?: string;
      toolName?: string;
    }) => {
      await session?.dispatch({
        type: "respondApproval",
        approvalId: options.id,
        approved: options.approved,
        reason: options.reason,
      });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const allPendingApproval = useMemo(() => {
    const all: UseAgentChatReturn["allPendingApproval"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolCallPart(part)) continue;
        if (!isPendingToolApproval(part)) continue;
        const approvalId = part.approval?.id;
        if (!approvalId) continue;
        all.push({
          id: approvalId,
          toolName: part.name,
          toolCallId: part.id,
        });
      }
    }
    return all;
  }, [messages]);

  const allPendingAskUser = useMemo(() => {
    const all: UseAgentChatReturn["allPendingAskUser"] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!isToolCallPart(part)) continue;
        if (part.name !== "ask_user") continue;
        if (part.state !== "input-complete" || part.output !== undefined) continue;
        const input = parseToolInput(part) as
          { question?: string; options?: string[]; multiSelect?: boolean } | undefined;
        all.push({
          toolCallId: part.id,
          question: input?.question ?? "",
          options: input?.options,
          multiSelect: input?.multiSelect,
        });
      }
    }
    return all;
  }, [messages]);

  const setClientToolWaiting = useCallback(
    (active: boolean) => {
      void session?.dispatch({ type: "setClientToolWaiting", active });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  const addToolOutput = useCallback(
    async (options: { tool: string; toolCallId: string; output: Record<string, unknown> }) => {
      await session?.dispatch({
        type: "addToolResult",
        toolCallId: options.toolCallId,
        output: options.output,
      });
      forceUpdate();
    },
    [session, forceUpdate]
  );

  return {
    messages,
    sendMessage,
    steer,
    followUp,
    forceSubmit,
    queuedMessages,
    allPendingApproval,
    allPendingAskUser,
    addToolOutput,
    setClientToolWaiting,
    status,
    isLoading,
    isReady: !initLoading && session !== null,
    stop,
    clearMessages,
    setMessages: (next) => {
      // Local UI mirror only until replaceMessages lands on Session; resume/clear use dispatch.
      if (next.length === 0) {
        void session?.dispatch({ type: "clear" });
        clearFlatMessageCache();
      }
      setMessages(next);
    },
    error,
    initLoading,
    initError,
    addToolApprovalResponse,
    saveSessionFromChat,
    saveError,
  };
}
