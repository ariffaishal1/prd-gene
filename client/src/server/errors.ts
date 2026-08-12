import type { ApiErrorBody, ApiErrorCode } from "@prd-studio/contracts";
import { NextResponse } from "next/server";

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function mapAiError(error: unknown): AppError {
  const candidate = error as { name?: string; status?: number; message?: string };
  const message = candidate?.message ?? "";

  if (candidate?.name === "APIConnectionTimeoutError" || /timed?\s*out|timeout/i.test(message)) {
    return new AppError("AI_TIMEOUT", "Gemini API tidak merespons dalam batas waktu. Coba lagi.", 504);
  }
  if (
    candidate?.status === 404 ||
    /model.+(not found|unknown|invalid)|models\/.+is not found/i.test(message)
  ) {
    return new AppError(
      "AI_MODEL_NOT_FOUND",
      "Model AI tidak ditemukan. Periksa AI_MODEL dan ketersediaan model di Gemini API.",
      502
    );
  }
  if (/vision|image.+(unsupported|not supported)|multimodal/i.test(message)) {
    return new AppError(
      "MODEL_NO_VISION",
      "Model yang dipilih tidak mendukung gambar. Gunakan model vision atau hapus lampiran gambar.",
      422
    );
  }
  return new AppError(
    "AI_UNAVAILABLE",
    "Layanan AI tidak dapat dihubungi. Pastikan GEMINI_API_KEY benar dan koneksi internet stabil.",
    502
  );
}

export function handleApiError(error: unknown): NextResponse<ApiErrorBody> {
  let appError = error instanceof AppError ? error : undefined;
  if (!appError) {
    console.error(error);
    appError = new AppError("INTERNAL_ERROR", "Terjadi kesalahan pada server.", 500);
  }
  return NextResponse.json(
    {
      success: false,
      error: { code: appError.code, message: appError.message }
    },
    { status: appError.status }
  );
}
