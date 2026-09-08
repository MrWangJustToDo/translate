import {
  AdapterProvider,
  App,
  configureEnv,
  initConfig,
  initHighlighter,
  useAgent,
} from "@my-agent/app";
import {
  clearCoreEnv,
  clearModelProvider,
  createDirectModelProvider,
  createRemoteProvider,
  hasCoreEnv,
  registerCoreEnv,
  registerModelProvider,
} from "@my-agent/core";
import { InkTerminalBox } from "@my-react/react-terminal/web";
import { WebglAddon } from "@xterm/addon-webgl";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import { PlaygroundAgentAdapter } from "./adapters/playground-adapter.js";
import { ConfigPanel } from "./components/ConfigPanel.js";
import { SplitPane } from "./components/SplitPane.js";
import { WorkspacePanel } from "./components/WorkspacePanel.js";
import { usePlaygroundConfig } from "./hooks/use-playground-config.js";
import { usePreviewPorts } from "./hooks/use-preview-ports.js";
import { getBootedWebContainer, getWebContainerEnv } from "./webcontainer/create-env.js";
import { resolveFetchProxyUrl, setFetchProxyUrl } from "./webcontainer/create-proxy-fetch.js";
import { subscribePreviewPorts } from "./webcontainer/subscribe-preview-ports.js";

import type { AgentAdapter } from "@my-agent/app";

configureEnv({ allowNonBrowserUpdates: true });

const AgentBootstrap = memo(() => {
  const model = usePlaygroundConfig((s) => s.model);
  const style = usePlaygroundConfig((s) => s.style);
  const baseURL = usePlaygroundConfig((s) => s.baseURL);
  const apiKey = usePlaygroundConfig((s) => s.apiKey);
  const providerServerUrl = usePlaygroundConfig((s) => s.providerServerUrl);
  const fetchProxyUrl = usePlaygroundConfig((s) => s.fetchProxyUrl);

  const [adapter, setAdapter] = useState<AgentAdapter | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Booting WebContainer…");
  const adapterRef = useRef<AgentAdapter | null>(null);
  const containerReadyRef = useRef(false);
  const initIdRef = useRef(0);

  const ensureCoreEnv = useCallback(async () => {
    setFetchProxyUrl(resolveFetchProxyUrl(fetchProxyUrl));

    if (hasCoreEnv()) return;

    const env = await getWebContainerEnv({ fetchProxyUrl });
    registerCoreEnv(env);
    containerReadyRef.current = true;
  }, [fetchProxyUrl]);

  const runBootstrap = useCallback(async () => {
    const currentInitId = ++initIdRef.current;

    try {
      setLoading(true);
      setError("");

      if (adapterRef.current) {
        await adapterRef.current.destroy();
        adapterRef.current = null;
        setAdapter(null);
      }

      setStatus(containerReadyRef.current ? "Restarting agent…" : "Booting WebContainer…");
      await ensureCoreEnv();
      if (currentInitId !== initIdRef.current) return;

      const serverUrl = providerServerUrl.trim();
      const remoteMode = Boolean(serverUrl);
      if (remoteMode) {
        // Remote mode: keys stay on the provider server; model/style/baseURL/apiKey come from /api/provider/info.
        setStatus("Connecting to provider server…");
        registerModelProvider(await createRemoteProvider(serverUrl));
      } else {
        registerModelProvider(createDirectModelProvider({ model, style, baseURL, apiKey }));
      }
      if (currentInitId !== initIdRef.current) return;

      setStatus("Initializing agent…");
      // Remote mode ignores local model/style/baseURL/apiKey (server is the single source of truth),
      // so only pass them in direct mode — otherwise the UI config would show the wrong model.
      await initConfig(
        remoteMode
          ? { model: "", style, baseURL: "", apiKey: "", debug: false }
          : { model, style, baseURL, apiKey, debug: false }
      );
      if (currentInitId !== initIdRef.current) return;

      await initHighlighter();
      if (currentInitId !== initIdRef.current) return;

      const playground = new PlaygroundAgentAdapter();

      adapterRef.current = playground;
      setAdapter(playground);
    } catch (err) {
      if (currentInitId !== initIdRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (currentInitId === initIdRef.current) {
        setLoading(false);
      }
    }
  }, [model, style, baseURL, apiKey, providerServerUrl, fetchProxyUrl, ensureCoreEnv]);

  useEffect(() => {
    void runBootstrap();
    return () => {
      if (adapterRef.current) {
        void adapterRef.current.destroy();
        adapterRef.current = null;
      }
      clearModelProvider();
      clearCoreEnv();
    };
  }, [runBootstrap]);

  if (error) {
    return (
      <div className="center-panel">
        <h2>Initialization error</h2>
        <p>{error}</p>
        <button type="button" onClick={() => void runBootstrap()}>
          Retry
        </button>
      </div>
    );
  }

  if (loading || !adapter) {
    return (
      <div className="center-panel">
        <span className="spinner" />
        <span>{status}</span>
      </div>
    );
  }

  return (
    <InkTerminalBox
      style={{ height: "100%" }}
      termOptions={{ fontSize: 14 }}
      inkRenderOptions={{ exitOnCtrlC: false }}
      onReady={(api) => {
        api.term.loadAddon(new WebglAddon());
      }}
    >
      <AdapterProvider value={adapter}>
        <App />
      </AdapterProvider>
    </InkTerminalBox>
  );
});

AgentBootstrap.displayName = "AgentBootstrap";

function useSubscribePreviewPorts(fetchProxyUrl: string) {
  useEffect(() => {
    let cancelled = false;
    let unsub: (() => void) | undefined;

    void getWebContainerEnv({ fetchProxyUrl }).then(() => {
      if (cancelled) return;
      const wc = getBootedWebContainer();
      if (!wc) return;
      const { upsertOpen, markReady, remove } = usePreviewPorts.getActions();
      unsub = subscribePreviewPorts(wc, {
        onOpen: (port, url) => upsertOpen(port, url),
        onClose: (port) => remove(port),
        onReady: (port, url) => markReady(port, url),
      });
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [fetchProxyUrl]);
}

export const PlaygroundApp = () => {
  const fetchProxyUrl = usePlaygroundConfig((s) => s.fetchProxyUrl);
  const workspaceVisible = usePlaygroundConfig((s) => s.workspaceVisible);
  const { setConfig } = usePlaygroundConfig.getActions();

  const [autoOpened, setAutoOpened] = useState(false);

  useSubscribePreviewPorts(fetchProxyUrl);

  useEffect(() => {
    if (autoOpened) return;
    if (hasCoreEnv()) {
      setConfig({ workspaceVisible: true });
      setAutoOpened(true);
    }
  }, [autoOpened, setConfig]);

  return (
    <div className="playground-shell">
      <ConfigPanel />
      <div className="playground-main">
        <SplitPane
          left={
            <div className="playground-terminal">
              <AgentBootstrap />
            </div>
          }
          right={<WorkspacePanel />}
          visible={workspaceVisible}
        />
      </div>
    </div>
  );
};
