import path from "node:path";
import { config as loadEnvironment } from "dotenv";

loadEnvironment({ path: path.resolve(import.meta.dirname, "../../.env"), quiet: true });

export interface AppConfig {
  port: number;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  corsOrigins: string[];
  uploadTtlMs: number;
}

export function loadConfig(environment = process.env): AppConfig {
  const port = Number(environment.PORT ?? 5001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT harus berupa nomor port yang valid.");
  }

  return {
    port,
    aiBaseUrl: (environment.AI_BASE_URL ?? "").replace(/\/$/, ""),
    aiApiKey: environment.GEMINI_API_KEY ?? environment.AI_API_KEY ?? "",
    aiModel: environment.AI_MODEL || "gemini-2.5-flash",
    corsOrigins: (environment.CORS_ORIGIN ?? "http://localhost:3000")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    uploadTtlMs: 30 * 60 * 1000
  };
}
