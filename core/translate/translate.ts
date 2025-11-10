import { generateText } from "xsai";

export const translate = async ({
  text,
  model,
  source_lang,
  target_lang,
}: {
  text: string;
  model: string;
  source_lang?: string;
  target_lang: string;
}) => {
  const response = await generateText({
    baseURL: "http://localhost:11434/v1/",
    messages: [
      {
        role: "system",
        content: `You are a professional translator. please translate the following in ${source_lang} into ${target_lang}, do not give any text other than the translated content, and trim the spaces at the end`,
      },
      {
        role: "user",
        content: `Translate the following text: ${text}`,
      },
    ],
    model: model,
  });

  return {
    text: response.text,
    source_lang,
    target_lang,
  };
};
