import parsePdf from "pdf-parse/lib/pdf-parse.js";
import { AppError } from "./errors.js";

const PDF_HEADER = Buffer.from("%PDF-");
const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);
const MAX_EXTRACTED_CHARS = 50_000;

export type ProcessedFile =
  | { kind: "text"; content: string; mimeType: string }
  | { kind: "image"; dataUrl: string; mimeType: string };

type PdfParser = (buffer: Buffer) => Promise<{ text: string }>;

function startsWith(buffer: Buffer, header: Buffer) {
  return buffer.subarray(0, header.length).equals(header);
}

function extensionOf(filename: string) {
  const match = filename.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export async function processUploadedFile(
  file: Express.Multer.File,
  pdfParser: PdfParser = parsePdf
): Promise<ProcessedFile> {
  const extension = extensionOf(file.originalname);

  if (extension === ".pdf") {
    if (file.mimetype !== "application/pdf" || !startsWith(file.buffer, PDF_HEADER)) {
      throw new AppError("INVALID_UPLOAD", "File PDF tidak memiliki format yang valid.", 422);
    }
    const parsed = await pdfParser(file.buffer);
    const text = parsed.text.trim();
    if (!text) {
      throw new AppError("INVALID_UPLOAD", "PDF tidak berisi teks yang dapat dibaca.", 422);
    }
    return { kind: "text", content: truncate(text), mimeType: "application/pdf" };
  }

  if (extension === ".png") {
    if (file.mimetype !== "image/png" || !startsWith(file.buffer, PNG_HEADER)) {
      throw new AppError("INVALID_UPLOAD", "File PNG tidak memiliki signature yang valid.", 422);
    }
    return toImage(file.buffer, "image/png");
  }

  if (extension === ".jpg" || extension === ".jpeg") {
    if (file.mimetype !== "image/jpeg" || !startsWith(file.buffer, JPEG_HEADER)) {
      throw new AppError("INVALID_UPLOAD", "File JPEG tidak memiliki signature yang valid.", 422);
    }
    return toImage(file.buffer, "image/jpeg");
  }

  if (extension === ".txt" || extension === ".md" || extension === ".markdown") {
    const validMimeTypes = ["text/plain", "text/markdown", "application/octet-stream"];
    if (!validMimeTypes.includes(file.mimetype) || file.buffer.includes(0)) {
      throw new AppError("INVALID_UPLOAD", "Lampiran teks tidak memiliki format UTF-8 yang valid.", 422);
    }
    const text = file.buffer.toString("utf8").trim();
    if (!text) {
      throw new AppError("INVALID_UPLOAD", "Lampiran teks tidak boleh kosong.", 422);
    }
    return {
      kind: "text",
      content: truncate(text),
      mimeType: extension === ".txt" ? "text/plain" : "text/markdown"
    };
  }

  throw new AppError(
    "INVALID_UPLOAD",
    "Format file tidak didukung. Gunakan PDF, TXT, Markdown, PNG, atau JPEG.",
    422
  );
}

function truncate(text: string) {
  if (text.length <= MAX_EXTRACTED_CHARS) return text;
  return `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[Isi dipotong karena melebihi batas konteks.]`;
}

function toImage(buffer: Buffer, mimeType: "image/png" | "image/jpeg"): ProcessedFile {
  return {
    kind: "image",
    dataUrl: `data:${mimeType};base64,${buffer.toString("base64")}`,
    mimeType
  };
}
