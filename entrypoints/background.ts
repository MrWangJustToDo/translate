import { detector, translate } from "@/core/translate";

import type { SettingType } from "@/hooks/useSyncConfig";

const defaultUrl = "http://localhost:11434";

// model name list
let list: SettingType["list"] = [];

// Ollama url
let url: SettingType["url"] = defaultUrl;

const init = async () => {
  const config = await storage.getItem<SettingType>("local:ollama-translate");

  list = config?.list || [];

  url = config?.url || defaultUrl;
};

storage.watch<SettingType>("local:ollama-translate", (newSettings) => {
  if (newSettings?.list?.length !== list.length) {
    list = Array.from(newSettings?.list || []);
  }
  if (newSettings?.url) {
    url = newSettings.url;
  }
});

init();

export default defineBackground(() => {
  console.log("Hello background!", { id: browser.runtime.id });

  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getOllamaApi") {
      (async function () {
        const url = request.url;

        try {
          const response = await fetch(url, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });
          if (response.ok) {
            const data = await response.json();
            sendResponse({ data: data });
          } else {
            sendResponse({ error: `Error: ${response.status} ${response.statusText}` });
          }
        } catch (error) {
          sendResponse({ error: `Network error: ${(error as Error)?.message}` });
        }
      })();
    }

    if (request.action === "postOllamaApi") {
      (async function () {
        const url = request.url;
        const data = request.data;

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
          });
          if (response.ok) {
            const data = await response.json();
            sendResponse({ data: data });
          } else {
            sendResponse({ error: `Error: ${response.status} ${response.statusText}` });
          }
        } catch (error) {
          sendResponse({ error: `Network error: ${(error as Error)?.message}` });
        }
      })();
    }

    if (request.action === "translate") {
      (async function () {
        const model = list.find((i) => i.key === request.model);
        if (model && url) {
          try {
            if (request.source_lang && request.target_lang) {
              const { text } = await translate({
                text: request.text,
                model: model.label,
                source_lang: request.source_lang,
                target_lang: request.target_lang,
              });

              sendResponse({
                data: {
                  source_lang: request.source_lang,
                  target_lang: request.target_lang,
                  source_text: request.text,
                  target_text: text,
                },
              });
            } else if (request.target_lang) {
              const { source_lang, target_lang } = await detector({
                text: request.text,
                model: model.label,
                target_lang: request.target_lang,
              });

              const { text } = await translate({
                text: request.text,
                model: model.label,
                source_lang,
                target_lang,
              });

              sendResponse({
                data: {
                  source_lang,
                  target_lang,
                  source_text: request.text,
                  target_text: text,
                },
              });
            }
          } catch (error) {
            sendResponse({ error: `Error: ${(error as Error)?.message}` });
          }
        } else {
          sendResponse({ error: `Model not found: ${request.model}` });
        }
      })();
    }

    return true; // Keep the message channel open for sendResponse
  });
});
