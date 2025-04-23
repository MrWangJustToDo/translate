import { Button } from "@heroui/react";
import { LanguagesIcon } from "lucide-react";
import useSWR from "swr";

const { check } = useOllamaStatus.getActions();

const { loadList } = useOllamaModal.getActions();

export default function App() {
  const ref = useRef<HTMLDivElement>(null);

  useSelect({ ref });

  const url = useOllamaConfig((s) => s.url);

  const status = useOllamaStatus((s) => s.state);

  const s = useSyncConfig({ side: "content" });

  const { state } = useSelectText();

  const { state: position } = useSelectPosition();

  useSWR(`state-${url}`, check);

  useSWR(`list-${url}-${status}`, loadList);

  console.log(s);

  return (
    <div ref={ref}>
      {state && (
        <div
          className="fixed z-[999999]"
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          <Button isIconOnly size="sm">
            <LanguagesIcon />
          </Button>
        </div>
      )}
    </div>
  );
}
