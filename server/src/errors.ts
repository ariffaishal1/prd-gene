import type { ApiErrorCode } from "@prd-studio/contracts";

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
    return new AppError("AI_TIMEOUT", "9Router tidak merespons dalam batas waktu. Coba lagi.", 504);
  }
  if (candidate?.status === 404 || /model.+(not found|unknown|invalid)/i.test(message)) {
    return new AppError(
      "AI_MODEL_NOT_FOUND",
      "Model AI tidak ditemukan. Periksa AI_MODEL dan koneksi provider di 9Router.",
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
    "Layanan AI tidak dapat dihubungi. Pastikan 9Router aktif dan kredensialnya benar.",
    502
  );
}
