import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOllama } from "@langchain/ollama";

import type { SettingType } from "@/hooks/useSyncConfig";

const defaultUrl = "http://localhost:11434";

const translatePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a professional translator. please translate the following in {source_lang} into {target_lang}, do not give any text other than the translated content, and trim the spaces at the end`,
  ],
  ["user", `Translate the following text: {text}`],
]);

const getLangPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a professional language detector. please detect the language of the following text, and return the language code, do not give any text other than the detected language code. if the text is chinese, please just return "chinese"`,
  ],
  ["user", `Detect the language of the following text: {text}`],
]);

const map = new Map<string, ChatOllama>();

const getModel = (model: string, url: string) => {
  const key = model + "-" + url;

  const exist = map.get(key);

  if (exist) {
    return exist;
  }

  const chat = new ChatOllama({ model, baseUrl: url });

  map.set(key, chat);

  return chat;
};

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

    if (request.action === "translate") {
      (async function () {
        const model = list.find((i) => i.key === request.model);
        if (model && url) {
          try {
            if (request.source_lang && request.target_lang) {
              const prompt = await translatePrompt.invoke({
                source_lang: request.source_lang,
                target_lang: request.target_lang,
                text: request.text,
              });

              const chatModel = getModel(model.label, url);

              const response = await chatModel.invoke(prompt);

              sendResponse({
                data: {
                  source_lang: request.source_lang,
                  target_lang: request.target_lang,
                  source_text: request.text,
                  target_text: response.content,
                },
              });
            } else if (request.target_lang) {
              const prompt = await getLangPrompt.invoke({
                text: request.text,
              });

              const chatModel = getModel(model.label, url);

              const response = await chatModel.invoke(prompt);

              const source_lang = response.content?.toString()?.trim();

              let target_lang = request.target_lang;

              if (source_lang?.startsWith("chinese")) {
                target_lang = "english";
              }

              const translate = await translatePrompt.invoke({
                source_lang,
                target_lang,
                text: request.text,
              });

              const translateResponse = await chatModel.invoke(translate);

              sendResponse({
                data: {
                  source_lang,
                  target_lang,
                  source_text: request.text,
                  target_text: translateResponse.content,
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
