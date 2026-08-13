import type { ApiErrorBody, HealthResponse } from "@prd-studio/contracts";
import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import multer from "multer";
import type { ZodType } from "zod";
import type { AiClient } from "./ai.js";
import { createAiClient } from "./ai.js";
import type { AppConfig } from "./config.js";
import { loadConfig } from "./config.js";
import { AppError } from "./errors.js";
import { processUploadedFile } from "./file-processor.js";
import { buildDiscoveryMessages, buildPrdMessages } from "./prompts.js";
import {
  chatRequestSchema,
  deleteUploadRequestSchema,
  generatePrdRequestSchema
} from "./schemas.js";
import { UploadStore } from "./upload-store.js";

interface CreateAppOptions {
  config?: AppConfig;
  ai?: AiClient;
  uploadStore?: UploadStore;
  rateLimitMax?: number;
}

export function createApp(options: CreateAppOptions = {}) {
  const config = options.config ?? loadConfig();
  const ai = options.ai ?? createAiClient(config);
  const uploadStore = options.uploadStore ?? new UploadStore(config.uploadTtlMs);
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new AppError("VALIDATION_ERROR", "Origin tidak diizinkan.", 403));
      }
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: options.rateLimitMax ?? 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_request, _response, next) =>
        next(new AppError("RATE_LIMITED", "Terlalu banyak permintaan. Coba lagi sebentar.", 429))
    })
  );

  app.get("/api/health", async (_request, response) => {
    let reachable = false;
    let modelAvailable = false;
    const modelConfigured = Boolean(config.aiApiKey && config.aiModel);
    if (modelConfigured) {
      try {
        const models = await ai.listModels();
        reachable = true;
        modelAvailable =
          models.includes(config.aiModel) ||
          models.some((m) => m === config.aiModel || m.includes(config.aiModel) || config.aiModel.includes(m));
      } catch {
        reachable = false;
      }
    }
    const body: HealthResponse = {
      status: reachable && modelAvailable ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      ai: { reachable, modelConfigured, modelAvailable }
    };
    response.json(body);
  });

  app.post("/api/chat", async (request, response, next) => {
    try {
      const body = parse(chatRequestSchema, request.body);
      const result = parseDiscoveryReply(await ai.complete(buildDiscoveryMessages(body.messages)));
      response.json({
        success: true,
        ...result,
        reply: isPrdContent(result.reply) ? documentOnly(result.reply) : result.reply
      });
    } catch (error) {
      next(error);
    }
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 }
  });

  app.post("/api/upload", upload.single("file"), async (request, response, next) => {
    try {
      const sessionId = parseSessionId(request.body?.sessionId);
      if (!request.file) {
        throw new AppError("INVALID_UPLOAD", "Pilih file yang ingin diunggah.", 400);
      }
      const processed = await processUploadedFile(request.file);
      const file = uploadStore.add(sessionId, request.file, processed);
      response.status(201).json({ success: true, file });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/uploads/:fileId", (request, response, next) => {
    try {
      const { sessionId } = parse(deleteUploadRequestSchema, request.body);
      const deleted = uploadStore.delete(request.params.fileId ?? "", sessionId);
      if (!deleted) {
        throw new AppError("UPLOAD_EXPIRED", "Lampiran tidak ditemukan atau sudah kedaluwarsa.", 410);
      }
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/generate-prd", async (request, response, next) => {
    try {
      const body = parse(generatePrdRequestSchema, request.body);
      const files = uploadStore.getMany(body.fileIds, body.sessionId);
      const prdContent = documentOnly(await ai.complete(buildPrdMessages(body.productTitle, body.history, files)));
      response.json({ success: true, prdContent, productTitle: extractPrdTitle(prdContent) });
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, _response, next) => {
    next(new AppError("VALIDATION_ERROR", "Endpoint tidak ditemukan.", 404));
  });

  const errorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    let appError = error instanceof AppError ? error : undefined;
    if (error instanceof multer.MulterError) {
      appError = new AppError(
        "INVALID_UPLOAD",
        error.code === "LIMIT_FILE_SIZE" ? "Ukuran file maksimal 10 MB." : "Upload file tidak valid.",
        422
      );
    }
    if (!appError) {
      console.error(error);
      appError = new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server.", 500);
    }
    const body: ApiErrorBody = {
      success: false,
      error: { code: appError.code, message: appError.message }
    };
    response.status(appError.status).json(body);
  };
  app.use(errorHandler);

  return { app, uploadStore };
}

function parse<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", result.error.issues[0]?.message ?? "Payload tidak valid.", 400);
  }
  return result.data;
}

function parseSessionId(value: unknown) {
  const result = deleteUploadRequestSchema.safeParse({ sessionId: value });
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "sessionId harus berupa UUID yang valid.", 400);
  }
  return result.data.sessionId;
}

function extractPrdTitle(prdContent: string) {
  const title = prdContent.match(/^#\s+(?!1\.\s+Overview & Objective\b)(.+)$/m)?.[1]?.trim();
  return title || "PRD tanpa judul";
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
