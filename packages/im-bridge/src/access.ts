/**
 * Access control — user/chat allowlists for inbound IM traffic.
 *
 * Access to the IM channel is access to the machine: the allowlist is the
 * security boundary. An empty list means "allow all" (single-operator setups).
 */

import type { BridgeConfig } from "./config.js";
import type { InboundMessage } from "./types.js";

export class AccessControl {
  constructor(private readonly config: BridgeConfig) {}

  allows(msg: InboundMessage): boolean {
    if (this.config.allowUsers.length > 0 && !this.config.allowUsers.includes(msg.userId)) return false;
    if (this.config.allowChats.length > 0 && !this.config.allowChats.includes(msg.chat.chatId)) return false;
    return true;
  }
}
