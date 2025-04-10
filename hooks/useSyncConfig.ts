import { watch } from "reactivity-store";

type SettingType = {
  url: string;
  state: string;
  connecting: boolean;
  selected: string;
  loading: boolean;
  list: { label: string; key: string }[];
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
        const list = useOllamaModal.getReactiveState().list;

        await storage.setItem("local:ollama-translate", {
          url,
          state,
          connecting,
          selected,
          loading,
          list,
        });
      });
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      const config = await storage.getItem("local:ollama-translate");
      if (config) {
        setSetting(config as SettingType);
      }
    };

    if (side === "content") {
      init();

      const unwatch = storage.watch<SettingType>("local:ollama-translate", (newSettings) => {
        setSetting(newSettings);
      });

      return () => unwatch();
    }
  }, []);

  return setting;
};
