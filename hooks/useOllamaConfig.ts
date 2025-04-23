import { createState } from "reactivity-store";

export const defaultUrl = "http://localhost:11434";

export const useOllamaConfig = createState(() => ({ url: defaultUrl }), {
  withActions: (s) => ({
    setUrl: (url: string) => {
      s.url = url;
    },
    reset: () => {
      s.url = defaultUrl;
    },
  }),
  withDeepSelector: false,
  withStableSelector: true,
  withPersist: "t-ollamaConfig",
});
