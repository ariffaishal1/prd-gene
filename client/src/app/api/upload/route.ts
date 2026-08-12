import { NextResponse } from "next/server";
import { AppError, handleApiError } from "../../../server/errors.js";
import { processUploadedFile } from "../../../server/file-processor.js";
import { deleteUploadRequestSchema } from "../../../server/schemas.js";
import { getUploadStore } from "../../../server/upload-store.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const rawSessionId = formData.get("sessionId");

    const sessionParse = deleteUploadRequestSchema.safeParse({ sessionId: rawSessionId });
    if (!sessionParse.success) {
      throw new AppError("VALIDATION_ERROR", "sessionId harus berupa UUID yang valid.", 400);
    }
    const sessionId = sessionParse.data.sessionId;

    if (!file || typeof file === "string") {
      throw new AppError("INVALID_UPLOAD", "Pilih file yang ingin diunggah.", 400);
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError("INVALID_UPLOAD", "Ukuran file maksimal 10 MB.", 422);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const processed = await processUploadedFile({
      originalname: file.name,
      mimetype: file.type,
      buffer
    });

    const uploadStore = getUploadStore();
    const storedFile = uploadStore.add(
      sessionId,
      { originalname: file.name, size: file.size },
      processed
    );

    return NextResponse.json({ success: true, file: storedFile }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
