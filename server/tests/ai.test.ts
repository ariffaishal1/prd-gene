import { describe, expect, it } from "vitest";
import { createAiClient } from "../src/ai.js";
import type { AppConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";

const unconfiguredConfig: AppConfig = {
  port: 5001,
  aiBaseUrl: "",
  aiApiKey: "",
  aiModel: "",
  corsOrigins: ["http://localhost:3000"],
  uploadTtlMs: 1800000
};

describe("createAiClient", () => {
  it("melempar AppError jika API Key atau model belum dikonfigurasi saat complete", async () => {
    const client = createAiClient(unconfiguredConfig);
    await expect(client.complete([{ role: "user", content: "halo" }])).rejects.toThrow(AppError);
  });

  it("melempar AppError jika API Key atau model belum dikonfigurasi saat listModels", async () => {
    const client = createAiClient(unconfiguredConfig);
    await expect(client.listModels()).rejects.toThrow(AppError);
  });
});
