import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { createAiClient } from "../../../server/ai.js";
import { loadConfig } from "../../../server/config.js";
import { AppError, handleApiError } from "../../../server/errors.js";
import { buildPrdMessages } from "../../../server/prompts.js";
import { generatePrdRequestSchema } from "../../../server/schemas.js";
import { getUploadStore } from "../../../server/upload-store.js";

export async function POST(request: Request) {
  try {
    const config = loadConfig();
    const ai = createAiClient(config);
    const bodyText = await request.json();
    const body = parse(generatePrdRequestSchema, bodyText);

    const uploadStore = getUploadStore();
    const files = uploadStore.getMany(body.fileIds, body.sessionId);
    const prdCompletion = await ai.complete(buildPrdMessages(body.productTitle, body.history, files));
    const prdContent = documentOnly(prdCompletion);

    return NextResponse.json({
      success: true,
      prdContent,
      productTitle: extractPrdTitle(prdContent)
    });
  } catch (error) {
    return handleApiError(error);
  }
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", result.error.issues[0]?.message ?? "Payload tidak valid.", 400);
  }
  return result.data;
}

function extractPrdTitle(prdContent: string) {
  const title = prdContent.match(/^#\s+(?!1\.\s+Overview & Objective\b)(.+)$/m)?.[1]?.trim();
  return title || "PRD tanpa judul";
}

function documentOnly(content: string) {
  const firstHeading = content.search(/^#{1,6}\s+\S/m);
  return firstHeading >= 0 ? content.slice(firstHeading).trim() : content.trim();
}
