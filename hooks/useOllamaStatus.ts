import { createState } from "reactivity-store";

import { useOllamaConfig } from "./useOllamaConfig";

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
          const response = await fetch(`${url}/api/version`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
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
    }),
    withDeepSelector: false,
    withStableSelector: true,
  }
);
