import { addToast, Button, Card, CardBody } from "@heroui/react";
import { LanguagesIcon } from "lucide-react";
import useSWR from "swr";

import { translateText } from "@/service/api";

const { check } = useOllamaStatus.getActions();

const { loadList } = useOllamaModal.getActions();

export default function App() {
  const ref = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);

  const [translate, setTranslate] = useState<{
    source_lang: string;
    target_lang: string;
    source_text: string;
    target_text: string;
  }>();

  useSelect({ ref, onClean: () => setTranslate(undefined) });

  const url = useOllamaConfig((s) => s.url);

  const status = useOllamaStatus((s) => s.state);

  const { selected } = useSyncConfig({ side: "content" }) || {};

  const { state } = useSelectText();

  const { state: position } = useSelectPosition();

  useSWR(`state-${url}`, check);

  useSWR(`list-${url}-${status}`, loadList);

  const callTranslate = async () => {
    if (!state || !selected) return;
    setLoading(true);

    const response = await translateText({ text: state });

    if (response.data) {
      setTranslate(response.data);
    } else {
      addToast({
        title: "翻译失败",
        description: response.error,
        severity: "warning",
      });
    }

    setLoading(false);
  };

  if (!status || !url) return null;

  return (
    <div ref={ref} data-popover>
      {state && (
        <div
          className="fixed z-[999999]"
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          {translate ? (
            <Card>
              <CardBody>
                <div>
                  <div className="text-sm text-gray-500">原文</div>
                  <div className="text-sm">{translate.source_text}</div>
                  <div className="text-sm text-gray-500">翻译</div>
                  <div className="text-sm">{translate.target_text}</div>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Button isIconOnly size="sm" onPress={callTranslate} isLoading={loading}>
              <LanguagesIcon />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
