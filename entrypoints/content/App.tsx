import { addToast, Button, Input, Popover, PopoverContent, PopoverTrigger } from "@heroui/react";
import { LanguagesIcon, RefreshCcwIcon } from "lucide-react";
import useSWR from "swr";

import { translateText } from "@/service/api";

const { check } = useOllamaStatus.getActions();

const { loadList } = useOllamaModal.getActions();

const removeAllSelection = () => {
  const selection = window.getSelection();

  if (!selection) return;

  for (let i = 0; i < selection.rangeCount; i++) {
    selection.removeRange(selection.getRangeAt(i));
  }
};

export default function App() {
  const ref = useRef<HTMLDivElement>(null);

  const [popover, setPopover] = useState<HTMLDivElement | null>();

  const [loading, setLoading] = useState(false);

  const [edit, setEdit] = useState<{ source_lang?: string; target_lang?: string; source_text?: string }>();

  const [translate, setTranslate] = useState<{
    source_lang: string;
    target_lang: string;
    source_text: string;
    target_text: string;
  }>();

  useSelect({ ignoreRef: ref, onClean: () => setTranslate(undefined), popoverEle: popover });

  const url = useOllamaConfig((s) => s.url);

  const status = useOllamaStatus((s) => s.state);

  const { selected } = useSyncConfig({ side: "content" }) || {};

  const { state, setText } = useSelectText();

  useSWR(`state-${url}`, check);

  useSWR(`list-${url}-${status}`, loadList);

  useEffect(() => {
    if (translate) {
      setEdit({
        source_lang: translate.source_lang,
        target_lang: translate.target_lang,
        source_text: translate.source_text,
      });
    } else {
      setEdit(undefined);
    }
  }, [translate]);

  const callTranslate = async () => {
    if (!state || !selected) return;
    setText("");

    removeAllSelection();

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

  const refreshTranslate = async () => {
    if (!translate || !selected) return;
    setLoading(true);

    const response = await translateText({
      text: translate.source_text,
      source_lang: edit?.source_lang,
      target_lang: edit?.target_lang,
    });

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
      <div className="fixed z-[999999]" ref={setPopover}>
        {!!(state || translate || loading) && (
          <>
            <Popover
              isOpen={!!translate}
              onClose={() => setTranslate(undefined)}
              shouldCloseOnScroll={false}
              portalContainer={popover || undefined}
            >
              <PopoverTrigger>
                <div className="h-[1px] w-[35px]" />
              </PopoverTrigger>
              <PopoverContent>
                <div className="w-[30vw] max-w-[400px] py-2">
                  <div className="flex items-center gap-x-2">
                    <Input
                      label="源语言"
                      size="sm"
                      value={edit?.source_lang || ""}
                      onChange={(e) => setEdit((l) => ({ ...l, source_lang: e.target.value || "" }))}
                    />
                    <Input
                      label="目标语言"
                      size="sm"
                      value={edit?.target_lang || ""}
                      onChange={(e) => setEdit((l) => ({ ...l, target_lang: e.target.value || "" }))}
                    />
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      onPress={refreshTranslate}
                      isLoading={loading}
                      className="text-gray-600"
                    >
                      <RefreshCcwIcon />
                    </Button>
                  </div>
                  <div className="mb-1 mt-3 flex flex-col">
                    <div className="text-sm text-gray-500">原文</div>
                    <div className="text-sm">{translate?.source_text}</div>
                  </div>
                  <div className="mb-2 flex flex-col">
                    <div className="text-sm text-gray-500">翻译</div>
                    <div className="text-sm">{translate?.target_text}</div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            {((!translate && !!state) || (loading && !translate)) && (
              <Button
                isIconOnly
                className="absolute left-0 top-0 z-10"
                size="sm"
                onPress={callTranslate}
                isLoading={loading}
              >
                <LanguagesIcon />
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
