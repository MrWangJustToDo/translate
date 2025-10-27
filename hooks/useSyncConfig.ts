import { toRaw, watch } from "reactivity-store";

export type SettingType = {
  url: string;
  state: boolean;
  connecting: boolean;
  selected: string;
  loading: boolean;
  list: { label: string; key: string }[];
};

export const getDefaultSettingConfig = (): SettingType => {
  return {
    url: defaultUrl,
    state: false,
    connecting: false,
    selected: "",
    loading: false,
    list: [],
  };
};

export const useSyncConfig = ({ side }: { side: "content" | "popup" }) => {
  const [setting, setSetting] = useState<SettingType | null>(null);

  useEffect(() => {
    if (side === "popup") {
      watch(async () => {
        const url = useOllamaConfig.getReactiveState().url;
        const state = useOllamaStatus.getReactiveState().state;
        const connecting = useOllamaStatus.getReactiveState().connecting;
        const selected = useOllamaModal.getReactiveState().selected;
        const loading = useOllamaModal.getReactiveState().loading;
        const list = toRaw(useOllamaModal.getReactiveState().list);

        await storage.setItem("local:ollama-translate", {
          url,
          state,
          connecting,
          selected,
          loading,
          list,
        } as SettingType);
      });
    }
  }, []);

  useEffect(() => {
    const sync = (newSettings: SettingType) => {
      useOllamaConfig.getActions().setUrl(newSettings.url);
      useOllamaStatus.getActions().setState(newSettings.state);
      useOllamaStatus.getActions().setConnecting(newSettings.connecting);
      useOllamaModal.getActions().setSelected(newSettings.selected);
      useOllamaModal.getActions().setLoading(newSettings.loading);
      useOllamaModal.getActions().setList(newSettings.list);
    }

    const init = async () => {
      const config = await storage.getItem<SettingType>("local:ollama-translate");
      const defaultConfig = getDefaultSettingConfig();
      const targetConfig = { ...defaultConfig, ...config };
      if (targetConfig) {
        setSetting(targetConfig);
        sync(targetConfig);
      }
    };

    if (side === "content") {
      init();

      const unwatch = storage.watch<SettingType>("local:ollama-translate", (newSettings) => {
        console.log("Sync settings in content script:", newSettings);
        setSetting(newSettings);
        if (newSettings) {
          sync(newSettings);
        }
        console.log("Sync completed.", useOllamaModal.getReadonlyState());
      });

      return () => unwatch();
    }
  }, []);

  return setting;
};
