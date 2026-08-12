import { randomUUID } from "node:crypto";
import type { UploadedFile } from "@prd-studio/contracts";
import { AppError } from "./errors.js";
import type { ProcessedFile } from "./file-processor.js";

interface StoredBase {
  meta: UploadedFile;
  sessionId: string;
}

export type StoredUpload = StoredBase & ProcessedFile;

export interface FileInfo {
  originalname: string;
  size: number;
}

export class UploadStore {
  private readonly files = new Map<string, StoredUpload>();
  private readonly cleanupTimer: NodeJS.Timeout;

  constructor(
    private readonly ttlMs: number = 30 * 60 * 1000,
    private readonly now: () => number = Date.now
  ) {
    this.cleanupTimer = setInterval(() => this.removeExpired(), Math.min(ttlMs, 60_000));
    this.cleanupTimer.unref();
  }

  add(sessionId: string, file: FileInfo, processed: ProcessedFile): UploadedFile {
    this.removeExpired();
    const id = randomUUID();
    const meta: UploadedFile = {
      id,
      filename: file.originalname,
      mimeType: processed.mimeType,
      size: file.size,
      expiresAt: new Date(this.now() + this.ttlMs).toISOString()
    };
    this.files.set(id, { meta, sessionId, ...processed });
    return meta;
  }

  getMany(ids: string[], sessionId: string): StoredUpload[] {
    this.removeExpired();
    return ids.map((id) => {
      const upload = this.files.get(id);
      if (!upload || upload.sessionId !== sessionId) {
        throw new AppError(
          "UPLOAD_EXPIRED",
          "Satu atau lebih lampiran sudah kedaluwarsa. Unggah kembali file tersebut.",
          410
        );
      }
      return upload;
    });
  }

  delete(id: string, sessionId: string): boolean {
    const upload = this.files.get(id);
    if (!upload || upload.sessionId !== sessionId) return false;
    return this.files.delete(id);
  }

  close() {
    clearInterval(this.cleanupTimer);
  }

  private removeExpired() {
    const currentTime = this.now();
    for (const [id, upload] of this.files) {
      if (Date.parse(upload.meta.expiresAt) <= currentTime) this.files.delete(id);
    }
  }
}

declare global {
  var globalUploadStore: UploadStore | undefined;
}

export function getUploadStore(): UploadStore {
  if (!globalThis.globalUploadStore) {
    globalThis.globalUploadStore = new UploadStore();
  }
  return globalThis.globalUploadStore;
}
