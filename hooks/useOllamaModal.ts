import { createState } from "reactivity-store";

import { getOllamaApi, postOllamaApi } from "@/service/api";

export const useOllamaModal = createState(
  () => ({ list: [] as { label: string; key: string; capabilities: string[] }[], selected: "", loading: false }),
  {
    withActions: (s) => ({
      loadList: async () => {
        if (s.loading) return;

        if (!useOllamaStatus.getReadonlyState().state) return;

        const url = useOllamaConfig.getReadonlyState().url;

        if (!url) return;

        s.loading = true;

        try {
          const response = await getOllamaApi(`${url}/api/tags`);

          const list = await Promise.all(
            response.data.models.map((i: any) => postOllamaApi(`${url}/api/show`, { model: i.name }))
          );

          if (response.data) {
            const data = response.data;

            s.list = data.models.map((i: { name: string }, index: number) => ({
              label: i.name,
              key: i.name,
              capabilities: list[index].data.capabilities,
            }));

            if (s.selected && s.list.some((i) => i.key === s.selected)) return;

            // s.selected = s.list[0]?.key || "";
          } else {
            s.list = [];

            s.selected = "";
          }
        } catch {
          s.list = [];

          s.selected = "";
        } finally {
          s.loading = false;
        }
      },

      setSelected: (selected?: string) => {
        s.selected = selected || "";
      },

      setLoading: (loading: boolean) => {
        s.loading = loading;
      },

      setList: (list: { label: string; key: string; capabilities: string[] }[]) => {
        s.list = list;
      },

      reset: () => {
        s.list = [];
        s.selected = "";
        s.loading = false;
      },
    }),
    withNamespace: "useOllamaModal",
  }
);
