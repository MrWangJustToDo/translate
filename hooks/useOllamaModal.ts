import { createState } from "reactivity-store";

export const useOllamaModal = createState(
  () => ({ list: [] as { label: string; key: string }[], selected: "", loading: false }),
  {
    withActions: (s) => ({
      loadList: async () => {
        if (s.loading) return;

        if (!useOllamaStatus.getReadonlyState().state) return;

        const url = useOllamaConfig.getReadonlyState().url;

        if (!url) return;

        s.loading = true;

        try {
          const response = await fetch(`${url}/api/tags`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (response.ok) {
            const data = await response.json();
            s.list = data.models.map((i: { name: string }) => ({ label: i.name, key: i.name }));

            s.selected = s.list[0]?.key || "";
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

      setList: (list: { label: string; key: string }[]) => {
        s.list = list;
      },

      reset: () => {
        s.list = [];
        s.selected = "";
        s.loading = false;
      },
    }),
  }
);
