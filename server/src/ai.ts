import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AppConfig } from "./config.js";
import { AppError, mapAiError } from "./errors.js";

export interface AiClient {
  complete(messages: ChatCompletionMessageParam[]): Promise<string>;
  listModels(): Promise<string[]>;
}

export function createAiClient(config: AppConfig): AiClient {
  const client = new OpenAI({
    apiKey: config.aiApiKey || "missing-key",
    baseURL: config.aiBaseUrl,
    timeout: 60_000,
    maxRetries: 1
  });

  function ensureConfigured() {
    if (!config.aiApiKey || !config.aiModel) {
      throw new AppError(
        "AI_UNAVAILABLE",
        "AI_API_KEY dan AI_MODEL harus dikonfigurasi di server.",
        503
      );
    }
  }

  return {
    async complete(messages) {
      ensureConfigured();
      try {
        const completion = await client.chat.completions.create({
          model: config.aiModel,
          messages,
          stream: false
        });
        const content = completion.choices[0]?.message.content?.trim();
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
        const models = await client.models.list();
        const ids: string[] = [];
        for await (const model of models) ids.push(model.id);
        return ids;
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw mapAiError(error);
      }
    }
  };
}
