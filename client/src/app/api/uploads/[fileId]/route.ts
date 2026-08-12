import { NextResponse } from "next/server";
import { AppError, handleApiError } from "../../../../server/errors.js";
import { deleteUploadRequestSchema } from "../../../../server/schemas.js";
import { getUploadStore } from "../../../../server/upload-store.js";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const body = await request.json();
    const result = deleteUploadRequestSchema.safeParse(body);
    if (!result.success) {
      throw new AppError("VALIDATION_ERROR", "Payload tidak valid.", 400);
    }

    const uploadStore = getUploadStore();
    const deleted = uploadStore.delete(fileId, result.data.sessionId);
    if (!deleted) {
      throw new AppError("UPLOAD_EXPIRED", "Lampiran tidak ditemukan atau sudah kedaluwarsa.", 410);
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return handleApiError(error);
  }
}
