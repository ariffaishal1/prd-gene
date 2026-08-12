import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { createAiClient } from "../../../server/ai.js";
import { loadConfig } from "../../../server/config.js";
import { AppError, handleApiError } from "../../../server/errors.js";
import { buildDiscoveryMessages } from "../../../server/prompts.js";
import { chatRequestSchema } from "../../../server/schemas.js";

export async function POST(request: Request) {
  try {
    const config = loadConfig();
    const ai = createAiClient(config);
    const bodyText = await request.json();
    const body = parse(chatRequestSchema, bodyText);

    const completion = await ai.complete(buildDiscoveryMessages(body.messages));
    const result = parseDiscoveryReply(completion);

    return NextResponse.json({
      success: true,
      ...result,
      reply: isPrdContent(result.reply) ? documentOnly(result.reply) : result.reply
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

function isPrdContent(content: string) {
  return /^#{1,6}\s*1\.\s+Overview & Objective\b/im.test(content) ||
    (/\b(?:Product Requirements Document|PRD)\b/i.test(content) && /^#{1,6}\s+\d+\.\s+/m.test(content));
}

function documentOnly(content: string) {
  const firstHeading = content.search(/^#{1,6}\s+\S/m);
  return firstHeading >= 0 ? content.slice(firstHeading).trim() : content.trim();
}

function parseDiscoveryReply(content: string) {
  const match = content.match(/\[PILIHAN\]\s*([\s\S]*?)(?:\s*\[\/PILIHAN\])?\s*$/i);
  const optionsText = match?.[1] ?? "";
  const choices = optionsText
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((choice, index, all) => all.indexOf(choice) === index)
    .slice(0, 3);

  return {
    reply: (match ? content.slice(0, match.index) : content).trim(),
    choices: choices?.length === 3
      ? choices
      : ["Lanjutkan discovery", "Saya ingin menambahkan konteks", "Saya belum yakin"]
  };
}
