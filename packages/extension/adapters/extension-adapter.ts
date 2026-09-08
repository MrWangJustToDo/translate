import { clearAgentStore, createAgentFromConfig } from "@my-agent/app";
import { agentManager, createLocalAgentSessionHost } from "@my-agent/core";

import type { AgentAdapter, AppConfig, ClipboardImageResult, InitResult } from "@my-agent/app";
import type { AgentSessionHost } from "@my-agent/core";

export class ExtensionAgentAdapter implements AgentAdapter {
  private host: AgentSessionHost | null = null;
  private agentId: string | null = null;

  async initialize(config: AppConfig): Promise<InitResult> {
    // Session plane: remote HTTP host when configured, else the in-page local
    // manager (agent loop runs against the registered CoreEnv / provider).
    const host = config.remoteSession
      ? (await import("@my-agent/server/client")).createRemoteAgentSessionHost({ baseUrl: config.remoteSession })
      : createLocalAgentSessionHost({ manager: agentManager });
    const result = await createAgentFromConfig({ config, name: "extension-chat", host });
    this.host = host;
    this.agentId = result.session.id;
    return result;
  }

  async destroy(): Promise<void> {
    if (this.host && this.agentId) {
      await this.host.destroy(this.agentId);
      this.host = null;
      this.agentId = null;
    }
    clearAgentStore();
  }

  exit(): void {
    this.destroy().then(() => {
      try {
        window.close();
      } catch {
        window.location.reload();
      }
    });
  }

  async readClipboardImage(): Promise<ClipboardImageResult | null> {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const buffer = await blob.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const data = btoa(binary);
        return { data, mediaType: imageType };
      }
      return null;
    } catch {
      return null;
    }
  }
}
