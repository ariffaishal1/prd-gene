import type { ChatMessage } from "@prd-studio/contracts";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "../src/ai.js";
import { createApp } from "../src/app.js";
import type { AppConfig } from "../src/config.js";
import { AppError } from "../src/errors.js";
import { UploadStore } from "../src/upload-store.js";

const sessionId = "11111111-1111-4111-8111-111111111111";
const config: AppConfig = {
  port: 5001,
  aiBaseUrl: "http://127.0.0.1:20128/v1",
  aiApiKey: "test-key",
  aiModel: "test/model",
  corsOrigins: ["http://localhost:3000"],
  uploadTtlMs: 30 * 60 * 1000
};
const history: ChatMessage[] = [
  {
    id: "message-1",
    role: "user",
    content: "Saya ingin membuat aplikasi reservasi klinik.",
    createdAt: "2026-08-01T00:00:00.000Z"
  }
];

function mockAi(overrides: Partial<AiClient> = {}): AiClient {
  return {
    complete: vi.fn().mockResolvedValue("Siapa pengguna utama produk ini?"),
    listModels: vi.fn().mockResolvedValue(["test/model"]),
    ...overrides
  };
}

describe("API", () => {
  it("melaporkan router dan model yang siap", async () => {
    const { app, uploadStore } = createApp({ config, ai: mockAi() });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body).toMatchObject({
      status: "ok",
      ai: { reachable: true, modelConfigured: true, modelAvailable: true }
    });
    uploadStore.close();
  });

  it("melaporkan degraded saat model tidak tersedia", async () => {
    const { app, uploadStore } = createApp({
      config,
      ai: mockAi({ listModels: vi.fn().mockResolvedValue(["model/lain"]) })
    });
    const response = await request(app).get("/api/health").expect(200);

    expect(response.body.status).toBe("degraded");
    expect(response.body.ai.modelAvailable).toBe(false);
    uploadStore.close();
  });

  it("mengirim riwayat discovery ke AI", async () => {
    const ai = mockAi();
    const { app, uploadStore } = createApp({ config, ai });
    const response = await request(app)
      .post("/api/chat")
      .send({ messages: history, sessionId })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      reply: "Siapa pengguna utama produk ini?",
      choices: ["Lanjutkan discovery", "Saya ingin menambahkan konteks", "Saya belum yakin"]
    });
    expect(ai.complete).toHaveBeenCalledOnce();
    uploadStore.close();
  });

  it("mengubah marker PILIHAN tanpa penutup menjadi pilihan klik", async () => {
    const ai = mockAi({
      complete: vi.fn().mockResolvedValue(
        "Apa masalah utama yang ingin diselesaikan?\n\n[PILIHAN]\n- Pengisi waktu luang\n- Nostalgia retro\n- Tantangan high-score"
      )
    });
    const { app, uploadStore } = createApp({ config, ai });
    const response = await request(app)
      .post("/api/chat")
      .send({ messages: history, sessionId })
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      reply: "Apa masalah utama yang ingin diselesaikan?",
      choices: ["Pengisi waktu luang", "Nostalgia retro", "Tantangan high-score"]
    });
    uploadStore.close();
  });

  it("menolak payload chat yang tidak valid", async () => {
    const { app, uploadStore } = createApp({ config, ai: mockAi() });
    const response = await request(app).post("/api/chat").send({ messages: [], sessionId }).expect(400);

    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    uploadStore.close();
  });

  it("mengunggah teks dan memakainya saat menghasilkan PRD", async () => {
    const ai = mockAi({
      complete: vi.fn().mockResolvedValue(
        "Berikut adalah draft PRD yang telah disesuaikan.\n\n---\n\n# Reservasi Klinik\n\n## 1. Overview & Objective"
      )
    });
    const { app, uploadStore } = createApp({ config, ai });
    const uploadResponse = await request(app)
      .post("/api/upload")
      .field("sessionId", sessionId)
      .attach("file", Buffer.from("Catatan kebutuhan pengguna"), {
        filename: "catatan.md",
        contentType: "text/markdown"
      })
      .expect(201);

    const response = await request(app)
      .post("/api/generate-prd")
      .send({
        history,
        sessionId,
        fileIds: [uploadResponse.body.file.id]
      })
      .expect(200);

    expect(response.body.prdContent).toBe("# Reservasi Klinik\n\n## 1. Overview & Objective");
    expect(response.body.productTitle).toBe("Reservasi Klinik");
    expect(ai.complete).toHaveBeenCalledOnce();
    const prompt = vi.mocked(ai.complete).mock.calls[0]?.[0]?.[0]?.content;
    expect(prompt).toContain("## 7. Roadmap Implementasi");
    expect(prompt).toContain("Phase 1 (MVP), Phase 2, dan Phase 3");
    uploadStore.close();
  });

  it("menghapus pengantar saat AI mengirim PRD lewat chat", async () => {
    const ai = mockAi({
      complete: vi.fn().mockResolvedValue(
        "Berikut adalah draft Product Requirements Document.\n\n# Reservasi Klinik\n\n## 1. Overview & Objective"
      )
    });
    const { app, uploadStore } = createApp({ config, ai });
    const response = await request(app)
      .post("/api/chat")
      .send({ messages: history, sessionId })
      .expect(200);

    expect(response.body.reply).toBe("# Reservasi Klinik\n\n## 1. Overview & Objective");
    uploadStore.close();
  });

  it("mengembalikan MODEL_NO_VISION dari adapter AI", async () => {
    const ai = mockAi({
      complete: vi
        .fn()
        .mockRejectedValue(
          new AppError("MODEL_NO_VISION", "Model yang dipilih tidak mendukung gambar.", 422)
        )
    });
    const { app, uploadStore } = createApp({ config, ai });
    const uploadResponse = await request(app)
      .post("/api/upload")
      .field("sessionId", sessionId)
      .attach("file", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), {
        filename: "sketsa.png",
        contentType: "image/png"
      })
      .expect(201);

    const response = await request(app)
      .post("/api/generate-prd")
      .send({ history, productTitle: "Reservasi Klinik", sessionId, fileIds: [uploadResponse.body.file.id] })
      .expect(422);

    expect(response.body.error.code).toBe("MODEL_NO_VISION");
    uploadStore.close();
  });

  it("menolak file yang sudah kedaluwarsa", async () => {
    let currentTime = Date.parse("2026-08-01T00:00:00.000Z");
    const store = new UploadStore(100, () => currentTime);
    const { app } = createApp({ config, ai: mockAi(), uploadStore: store });
    const uploadResponse = await request(app)
      .post("/api/upload")
      .field("sessionId", sessionId)
      .attach("file", Buffer.from("Konteks"), { filename: "konteks.txt", contentType: "text/plain" })
      .expect(201);
    currentTime += 101;

    const response = await request(app)
      .post("/api/generate-prd")
      .send({ history, productTitle: "Reservasi Klinik", sessionId, fileIds: [uploadResponse.body.file.id] })
      .expect(410);

    expect(response.body.error.code).toBe("UPLOAD_EXPIRED");
    store.close();
  });

  it("membatasi request berlebihan", async () => {
    const { app, uploadStore } = createApp({ config, ai: mockAi(), rateLimitMax: 1 });
    await request(app).get("/api/health").expect(200);
    const response = await request(app).get("/api/health").expect(429);

    expect(response.body.error.code).toBe("RATE_LIMITED");
    uploadStore.close();
  });
});
