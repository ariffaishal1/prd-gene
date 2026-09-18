import { GoogleGenAI, type Content, type Part } from "@google/genai";
import type { AppConfig } from "./config.js";
import { AppError, mapAiError } from "./errors.js";
import type { AiMessage, MessageContentPart } from "./prompts.js";

/** Preferred fallback order when the requested model is unavailable. */
const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

export interface AiClient {
  complete(messages: AiMessage[], modelOverride?: string): Promise<string>;
  listModels(): Promise<string[]>;
  getActiveModel(): string;
}

export function createAiClient(config: AppConfig): AiClient {
  const client = new GoogleGenAI({
    apiKey: config.aiApiKey || "missing-key"
  });

  let cachedModels: string[] | null = null;
  let cacheExpiry = 0;
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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

  function isModelNotFoundError(error: unknown): boolean {
    const candidate = error as { status?: number; message?: string };
    if (candidate?.status === 404) return true;
    const message = candidate?.message ?? "";
    return /model.+(not found|unknown|invalid)|models\/.+is not found/i.test(message);
  }

  async function fetchModels(): Promise<string[]> {
    const now = Date.now();
    if (cachedModels && now < cacheExpiry) return cachedModels;

    const pager = await client.models.list();
    const ids: string[] = [];
    for await (const model of pager) {
      if (model.name) {
        ids.push(model.name.replace(/^models\//, ""));
      }
    }
    cachedModels = ids;
    cacheExpiry = now + CACHE_TTL_MS;
    return ids;
  }

  function buildFallbackQueue(requestedModel: string): string[] {
    const queue: string[] = [];
    for (const fb of FALLBACK_MODELS) {
      if (fb !== requestedModel && !queue.includes(fb)) {
        queue.push(fb);
      }
    }
    return queue;
  }

  return {
    getActiveModel() {
      return config.aiModel;
    },

    async complete(messages, modelOverride) {
      ensureConfigured();
      const requestedModel = modelOverride || config.aiModel;
      const { systemInstruction, contents } = convertMessagesToGemini(messages);

      const tryModel = async (model: string) => {
        const response = await client.models.generateContent({
          model,
          contents,
          config: systemInstruction ? { systemInstruction } : undefined
        });
        const content = response.text?.trim();
        if (!content) throw new Error("Empty model response");
        return content;
      };

      // First attempt with requested model
      try {
        return await tryModel(requestedModel);
      } catch (error) {
        if (error instanceof AppError) throw error;
        if (!isModelNotFoundError(error)) throw mapAiError(error);
      }

      // Auto-fallback: try alternative models
      const fallbacks = buildFallbackQueue(requestedModel);
      for (const fallbackModel of fallbacks) {
        try {
          console.warn(`Model "${requestedModel}" tidak tersedia, mencoba fallback: ${fallbackModel}`);
          return await tryModel(fallbackModel);
        } catch (fbError) {
          if (fbError instanceof AppError) throw fbError;
          if (!isModelNotFoundError(fbError)) throw mapAiError(fbError);
          // model also not found, try next
        }
      }

      // All models failed
      throw new AppError(
        "AI_MODEL_NOT_FOUND",
        `Model "${requestedModel}" dan semua fallback tidak tersedia. Periksa ketersediaan model di Gemini API.`,
        502
      );
    },

    async listModels() {
      ensureConfigured();
      try {
        return await fetchModels();
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw mapAiError(error);
      }
    }
  };
}

