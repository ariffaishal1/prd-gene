import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { AppConfig } from "./config.js";
import { AppError, mapAiError } from "./errors.js";
import type { AiMessage, MessageContentPart } from "./prompts.js";

export interface AiClient {
  complete(messages: AiMessage[]): Promise<string>;
  listModels(): Promise<string[]>;
}

export function createAiClient(config: AppConfig): AiClient {
  const client = new GoogleGenAI({
    apiKey: config.aiApiKey || "missing-key"
  });

  function ensureConfigured() {
    if (!config.aiApiKey || !config.aiModel) {
      throw new AppError(
        "AI_UNAVAILABLE",
        "GEMINI_API_KEY dan AI_MODEL harus dikonfigurasi di server.",
        503
      );
    }
  }

  function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
    const match = /^data:(.*?);base64,(.*)$/.exec(dataUrl);
    if (!match || !match[1] || !match[2]) return null;
    return { mimeType: match[1], data: match[2] };
  }

  function convertMessagesToGemini(messages: AiMessage[]): {
    systemInstruction: string | undefined;
    contents: Content[];
  } {
    let systemInstruction: string | undefined;
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        const sysText = typeof msg.content === "string" ? msg.content : "";
        systemInstruction = systemInstruction ? `${systemInstruction}\n\n${sysText}` : sysText;
        continue;
      }

      const role = msg.role === "assistant" ? "model" : "user";
      const parts: Part[] = [];

      if (typeof msg.content === "string") {
        parts.push({ text: msg.content });
      } else if (Array.isArray(msg.content)) {
        for (const part of msg.content as MessageContentPart[]) {
          if (part.type === "text") {
            parts.push({ text: part.text });
          } else if (part.type === "image_url" && part.image_url?.url) {
            const parsed = parseDataUrl(part.image_url.url);
            if (parsed) {
              parts.push({
                inlineData: {
                  mimeType: parsed.mimeType,
                  data: parsed.data
                }
              });
            }
          }
        }
      }

      contents.push({ role, parts });
    }

    return { systemInstruction, contents };
  }

  return {
    async complete(messages) {
      ensureConfigured();
      try {
        const { systemInstruction, contents } = convertMessagesToGemini(messages);
        const response = await client.models.generateContent({
          model: config.aiModel,
          contents,
          config: systemInstruction ? { systemInstruction } : undefined
        });

        const content = response.text?.trim();
        if (!content) {
          throw new Error("Empty model response");
        }
        return content;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw mapAiError(error);
      }
    },

    async listModels() {
      ensureConfigured();
      try {
        const pager = await client.models.list();
        const ids: string[] = [];
        for await (const model of pager) {
          if (model.name) {
            const cleanId = model.name.replace(/^models\//, "");
            ids.push(cleanId);
          }
        }
        return ids;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw mapAiError(error);
      }
    }
  };
}
