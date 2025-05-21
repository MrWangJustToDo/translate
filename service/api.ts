export const getOllamaApi = (url: string): Promise<{ data?: any; error?: string }> => {
  return browser.runtime.sendMessage({ action: "getOllamaApi", url });
};

export const translateText = ({
  text,
  source_lang,
  target_lang = "chinese_simplified",
}: {
  text: string;
  source_lang?: string;
  target_lang?: string;
}): Promise<{ data?: any; error?: string }> => {
  const model = useOllamaModal.getReadonlyState().selected;
  return browser.runtime.sendMessage({
    action: "translate",
    model,
    text,
    source_lang,
    target_lang,
  });
};
