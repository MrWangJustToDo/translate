import { generateText } from "xsai";

export const detector = async ({
  text,
  model,
  target_lang,
}: {
  text: string;
  model: string;
  source_lang?: string;
  target_lang: string;
}): Promise<{ text: string; source_lang: string; target_lang: string }> => {
  const response = await generateText({
    baseURL: "http://localhost:11434/v1/",
    messages: [
      {
        role: "system",
        content: `You are a professional language detector. please detect the language of the following text, and return the language code, do not give any text other than the detected language code. if the text is chinese, please just return "chinese"`,
      },
      {
        role: "user",
        content: `Detect the language of the following text: ${text}`,
      },
    ],
    model: model,
  });

  const detector_source_lang = response.text?.trim()?.toString();

  let final_target_lang = target_lang;

  if (detector_source_lang?.startsWith("chinese")) {
    final_target_lang = "english";
  }

  return {
    text,
    source_lang: detector_source_lang || "unknown",
    target_lang: final_target_lang,
  };
};
