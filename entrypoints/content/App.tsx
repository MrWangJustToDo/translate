import { Button } from "@heroui/react";
import { LanguagesIcon } from "lucide-react";

import { useSelect } from "@/hooks/useTextSelect";

export default function App() {
  const ref = useRef<HTMLDivElement>(null);

  useSelect({ ref });

  const s = useSyncConfig({ side: "content" });

  const { state } = useSelectText();

  const { state: position } = useSelectPosition();

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
