import type { HealthResponse } from "@prd-studio/contracts";
import { NextResponse } from "next/server";
import { createAiClient } from "../../../server/ai.js";
import { loadConfig } from "../../../server/config.js";

export async function GET() {
  const config = loadConfig();
  const ai = createAiClient(config);

  let reachable = false;
  let modelAvailable = false;
  const modelConfigured = Boolean(config.aiApiKey && config.aiModel);

  if (modelConfigured) {
    try {
      const models = await ai.listModels();
      reachable = true;
      modelAvailable = models.includes(config.aiModel);
    } catch {
      reachable = false;
    }
  }

  const body: HealthResponse = {
    status: reachable && modelAvailable ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    ai: { reachable, modelConfigured, modelAvailable }
  };

  return NextResponse.json(body);
}
