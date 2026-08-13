export interface AppConfig {
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  uploadTtlMs: number;
}

export function loadConfig(environment = process.env): AppConfig {
  return {
    aiBaseUrl: (environment.AI_BASE_URL ?? "").replace(/\/$/, ""),
    aiApiKey: environment.GEMINI_API_KEY ?? environment.AI_API_KEY ?? "",
    aiModel: environment.AI_MODEL || "gemini-2.5-flash",
    uploadTtlMs: 30 * 60 * 1000
  };
}
