import type { ChatMessage } from "@prd-studio/contracts";
import type {
  ChatCompletionContentPart,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";
import type { StoredUpload } from "./upload-store.js";

export const DISCOVERY_SYSTEM_PROMPT = `Anda adalah Senior AI Product Manager yang memandu discovery produk dalam Bahasa Indonesia.
Ajukan tepat satu pertanyaan klarifikasi yang paling penting pada setiap jawaban.
Fokus berurutan pada target pengguna, masalah utama, fitur wajib, platform, dan batasan.
Gunakan bahasa ringkas dan konkret. Jangan menghasilkan PRD pada tahap ini.
Setelah konteks cukup atau sudah ada empat pertanyaan asisten, nyatakan bahwa konteks siap dibuat menjadi PRD.
Di akhir setiap jawaban, selalu tambahkan tepat tiga pilihan jawaban singkat dan kontekstual dengan format berikut:
[PILIHAN]
- pilihan pertama
- pilihan kedua
- pilihan ketiga
[/PILIHAN]`;

export const PRD_SYSTEM_PROMPT = `Anda adalah Senior AI Product Manager. Susun PRD siap implementasi dalam Bahasa Indonesia.
Keluarkan Markdown langsung tanpa pagar kode. Output harus dimulai langsung dengan judul produk sebagai heading tingkat satu; jangan menambahkan salam, kalimat pengantar, penjelasan, atau garis pemisah sebelum judul. Lalu wajib menggunakan tujuh heading tingkat dua berikut:
## 1. Overview & Objective
## 2. User Personas & Pain Points
## 3. Functional Requirements
## 4. Non-Functional Requirements & Security
## 5. Recommended Tech Stack & System Architecture
## 6. Out of Scope (Phase 1)
## 7. Roadmap Implementasi
Bagian Functional Requirements wajib berisi tabel fitur dan acceptance criteria yang dapat diuji.
Pada Roadmap Implementasi, susun Phase 1 (MVP), Phase 2, dan Phase 3. Jelaskan tujuan, cakupan, dan kriteria selesai singkat untuk setiap phase. Phase 2 dan Phase 3 harus berupa rekomendasi lanjutan berdasarkan fakta yang tersedia; jangan mengarang komitmen atau tanggal.
Gunakan hanya fakta dari percakapan dan lampiran. Tandai asumsi secara eksplisit.`;

export function buildDiscoveryMessages(history: ChatMessage[]): ChatCompletionMessageParam[] {
  return [
    { role: "system", content: DISCOVERY_SYSTEM_PROMPT },
    ...history.map((message) => ({
      role: message.role,
      content: message.content
    }))
  ];
}

export function buildPrdMessages(
  title: string,
  history: ChatMessage[],
  uploads: StoredUpload[]
): ChatCompletionMessageParam[] {
  const transcript = history
    .map((message) => `${message.role === "user" ? "Pengguna" : "AI"}: ${message.content}`)
    .join("\n\n");

  const textAttachments = uploads
    .filter((upload) => upload.kind === "text")
    .map((upload) => `--- ${upload.meta.filename} ---\n${upload.content}`)
    .join("\n\n");

  const content: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `${title ? `Judul produk yang diusulkan: ${title}` : "Tentukan judul produk dari riwayat discovery."}\n\nRiwayat discovery:\n${transcript}${
        textAttachments ? `\n\nLampiran teks:\n${textAttachments}` : ""
      }`
    }
  ];

  for (const upload of uploads) {
    if (upload.kind === "image") {
      content.push({
        type: "image_url",
        image_url: { url: upload.dataUrl, detail: "auto" }
      });
    }
  }

  return [
    { role: "system", content: PRD_SYSTEM_PROMPT },
    { role: "user", content }
  ];
}
