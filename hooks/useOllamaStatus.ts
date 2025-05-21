import { createState } from "reactivity-store";

import { getOllamaApi } from "@/service/api";

export const useOllamaStatus = createState(
  () => ({ state: false, connecting: false }) as { state: boolean; connecting: boolean },
  {
    withActions: (s) => ({
      check: async () => {
        if (s.connecting) return;

        const url = useOllamaConfig.getReadonlyState().url;

        if (!url) return;

        s.connecting = true;

        try {
          const response = await getOllamaApi(`${url}/api/version`);

          if (response.data || !response.error) {
            s.state = true;
          } else {
            s.state = false;
          }
        } catch {
          s.state = false;
        } finally {
          s.connecting = false;
        }
      },
      setState: (state: boolean) => {
        s.state = state;
      },
      setConnecting: (connecting: boolean) => {
        s.connecting = connecting;
      },
      reset: () => {
        s.state = false;
        s.connecting = false;
      },
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);
