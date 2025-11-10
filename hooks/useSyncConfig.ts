import { toRaw, watch } from "reactivity-store";

export type SettingType = {
  url: string;
  state: boolean;
  connecting: boolean;
  selected: string;
  loading: boolean;
  list: { label: string; key: string; capabilities: string[] }[];
};

const defaultList: SettingType["list"] = [];

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
  useEffect(() => {
    if (side === "popup") {
      const init = async () => {
        const url = await storage.getItem<SettingType["url"]>("local:ollama-translate-url");

        if (url) {
          useOllamaConfig.getActions().setUrl(url);
        }

        const selected = await storage.getItem<SettingType["selected"]>("local:ollama-translate-selected");

        if (selected) {
          useOllamaModal.getActions().setSelected(selected);
        }
      };

      init();

      const handler = watch(async () => {
        const url = useOllamaConfig.getReactiveState().url;

        const selected = useOllamaModal.getReactiveState().selected;

        await storage.setItem("local:ollama-translate-url", url);

        await storage.setItem("local:ollama-translate-selected", selected);
      });

      return handler;
    }
  }, []);

  useEffect(() => {
    if (side === "popup") {
      const init = async () => {
        const list = await storage.getItem<SettingType["list"]>("local:ollama-translate-list");

        if (Array.isArray(list) && list.length > 0) {
          useOllamaModal.getActions().setList(list);

          return;
        }

        useOllamaModal.getActions().setList(defaultList);
      };

      init();

      const unWatch = storage.watch<SettingType["list"]>("local:ollama-translate-list", (newValue) => {
        if (Array.isArray(newValue) && newValue.length > 0) {
          useOllamaModal.getActions().setList(newValue);

          return;
        }

        useOllamaModal.getActions().setList(defaultList);
      });

      return unWatch;
    }
  }, []);

  useEffect(() => {
    if (side === "content") {
      const init = async () => {
        const list = useOllamaModal.getReactiveState().list;

        await storage.setItem("local:ollama-translate-list", toRaw(list));
      };

      const handler = watch(init);

      return handler;
    }
  }, []);

  useEffect(() => {
    if (side === "content") {
      const init = async () => {
        const url = await storage.getItem<SettingType["url"]>("local:ollama-translate-url");

        useOllamaConfig.getActions().setUrl(url || defaultUrl);
      };

      init();

      const unWatch = storage.watch<SettingType["url"]>("local:ollama-translate-url", (newValue) => {
        useOllamaConfig.getActions().setUrl(newValue || defaultUrl);
      });

      return unWatch;
    }
  }, []);

  useEffect(() => {
    if (side === "content") {
      const init = async () => {
        const selected = await storage.getItem<SettingType["selected"]>("local:ollama-translate-selected");

        useOllamaModal.getActions().setSelected(selected || "");
      };

      init();

      const unWatch = storage.watch<SettingType["selected"]>("local:ollama-translate-selected", (newValue) => {
        useOllamaModal.getActions().setSelected(newValue || "");
      });

      return unWatch;
    }
  }, []);
};
