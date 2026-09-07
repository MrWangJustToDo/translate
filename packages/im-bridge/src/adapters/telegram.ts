/**
 * Telegram adapter — grammY long-polling implementation of {@link ChatAdapter}.
 *
 * Translation only: normalizes messages/button clicks into bridge primitives
 * and maps outbound primitives onto the Telegram Bot API. Holds no agent state.
 *
 * Loop prevention: messages from bots are never delivered. In group chats the
 * adapter is mention-only — text must @-mention the bot (or be a command
 * addressed to it) to reach the bridge.
 */

import { Bot } from "grammy";

import type {
  AdapterCaps,
  Button,
  ButtonCallback,
  ChatAdapter,
  ChatTarget,
  InboundMessage,
  SendOptions,
  SentMessageRef,
} from "../types.js";

const TG_MAX_TEXT = 4096;
const CALLBACK_DATA_LIMIT = 64;
const NOT_MODIFIED_PATTERN = /message is not modified/i;

/** Bridge-level commands; Telegram-specific `/cmd@OtherBot` addressing is filtered. */
const COMMAND_PATTERN = /^\/(new|stop)(?:@([\w-]+))?(?:\s|$)/;

export interface TelegramAdapterOptions {
  botToken: string;
  onError?: (error: unknown) => void;
}

interface RawChat {
  id: number;
  type: string;
}

interface RawMessage {
  message_thread_id?: number;
  text?: string;
  caption?: string;
  from?: { id: number; is_bot: boolean } | undefined;
  chat: RawChat;
}

function toTarget(chat: RawChat): ChatTarget {
  const chatType = chat.type === "private" ? "private" : chat.type === "channel" ? "channel" : "group";
  return { chatId: String(chat.id), chatType };
}

function toKeyboard(
  buttons: Button[] | undefined
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | undefined {
  if (!buttons || buttons.length === 0) return undefined;
  return { inline_keyboard: [buttons.map((button) => ({ text: button.label, callback_data: button.data }))] };
}

function clamp(text: string): string {
  // The runtime splits oversized replies (code-block aware); this is a last-resort guard.
  return text.length <= TG_MAX_TEXT ? text : `${text.slice(0, TG_MAX_TEXT - 1)}…`;
}

export class TelegramAdapter implements ChatAdapter {
  readonly platform = "telegram";
  readonly caps: AdapterCaps = {
    markdown: false, // first version sends plain text — MarkdownV2 escaping is strict
    editMessage: true,
    buttons: true,
    maxTextLength: TG_MAX_TEXT,
    streaming: "edit",
  };

  private readonly bot: Bot;
  private readonly onError: (error: unknown) => void;
  private messageHandler: ((msg: InboundMessage) => Promise<void>) | null = null;
  private buttonHandler: ((cb: ButtonCallback) => Promise<void>) | null = null;
  private started = false;

  constructor(options: TelegramAdapterOptions) {
    this.onError = options.onError ?? (() => {});
    this.bot = new Bot(options.botToken);
    this.bot.catch((error) => this.onError(error.error));
    this.registerHandlers();
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.bot.init(); // populates botInfo.username used by mention checks
    // bot.start() long-polls until stop(); it must not be awaited here.
    void this.bot.start({
      onStart: () => {
        // Long polling active — inbound delivery happens via handlers.
      },
    });
    this.started = true;
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    await this.bot.stop();
    this.started = false;
  }

  onMessage(handler: (msg: InboundMessage) => Promise<void>): void {
    this.messageHandler = handler;
  }

  onButton(handler: (cb: ButtonCallback) => Promise<void>): void {
    this.buttonHandler = handler;
  }

  async sendText(target: ChatTarget, text: string, options?: SendOptions): Promise<SentMessageRef> {
    const message = await this.bot.api.sendMessage(target.chatId, clamp(text), {
      ...(target.threadId !== undefined ? { message_thread_id: Number(target.threadId) } : {}),
      reply_markup: toKeyboard(options?.buttons),
    });
    return { messageId: String(message.message_id), chat: target };
  }

  async sendButtons(target: ChatTarget, text: string, buttons: Button[]): Promise<SentMessageRef> {
    assertCallbackData(buttons);
    return this.sendText(target, text, { buttons });
  }

  async editMessage(target: ChatTarget, messageId: string, text: string, options?: SendOptions): Promise<void> {
    try {
      await this.bot.api.editMessageText(target.chatId, Number(messageId), clamp(text), {
        reply_markup: toKeyboard(options?.buttons),
      });
    } catch (error) {
      // Editing with identical content is a no-op condition, not a failure.
      if (error instanceof Error && NOT_MODIFIED_PATTERN.test(error.message)) return;
      throw error;
    }
  }

  async setTyping(target: ChatTarget): Promise<void> {
    await this.bot.api.sendChatAction(target.chatId, "typing");
  }

  private registerHandlers(): void {
    this.bot.on("message", async (ctx) => {
      const message = ctx.message as unknown as RawMessage | undefined;
      const handler = this.messageHandler;
      if (!message || !handler) return;
      if (message.from?.is_bot) return; // loop prevention: never deliver bot messages

      const target = toTarget(message.chat);
      const isPrivate = target.chatType === "private";
      const threadId = message.message_thread_id !== undefined ? String(message.message_thread_id) : undefined;
      if (threadId !== undefined) target.threadId = threadId;

      const text = message.text ?? message.caption ?? "";
      const command = this.extractCommand(text, isPrivate);
      // Group chats are mention-only: require an @-mention for both text and commands.
      if (!isPrivate && !this.mentionsBot(text)) return;

      await handler({
        platform: this.platform,
        chat: target,
        userId: String(message.from?.id ?? ""),
        ...(command !== undefined ? { command } : {}),
        text,
        raw: ctx.message,
      });
    });

    this.bot.on("callback_query:data", async (ctx) => {
      const handler = this.buttonHandler;
      if (!handler) return;
      const query = ctx.callbackQuery;
      const message = query.message as unknown as { chat: RawChat; message_id: number } | undefined;
      if (!message) {
        await ctx.answerCallbackQuery({ text: "Unsupported callback target" });
        return;
      }
      await handler({
        platform: this.platform,
        chat: toTarget(message.chat),
        messageId: String(message.message_id),
        userId: String(query.from.id),
        data: query.data,
        ack: async () => {
          await ctx.answerCallbackQuery();
        },
      });
    });
  }

  private extractCommand(text: string, isPrivate: boolean): InboundMessage["command"] {
    const match = COMMAND_PATTERN.exec(text);
    if (!match) return undefined;
    const [, name, addressedTo] = match;
    // In groups, `/new@OtherBot` belongs to another bot — ignore it.
    if (!isPrivate && addressedTo && addressedTo !== this.bot.botInfo?.username) return undefined;
    return name as InboundMessage["command"];
  }

  private mentionsBot(text: string): boolean {
    const username = this.bot.botInfo?.username;
    return username !== undefined && text.includes(`@${username}`);
  }
}

function assertCallbackData(buttons: Button[]): void {
  for (const button of buttons) {
    if (button.data.length > CALLBACK_DATA_LIMIT) {
      throw new Error(`Button callback_data exceeds Telegram's ${CALLBACK_DATA_LIMIT}-byte limit: ${button.data}`);
    }
  }
}
