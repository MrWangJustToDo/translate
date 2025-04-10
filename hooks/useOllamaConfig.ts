import { createState } from "reactivity-store";

const defaultUrl = "http://localhost:11434";

export const useOllamaConfig = createState(() => ({ url: defaultUrl }), {
  withActions: (s) => ({
    setUrl: (url: string) => {
      s.url = url;
    },
  }),
  withDeepSelector: false,
  withPersist: "t-ollamaConfig",
});
