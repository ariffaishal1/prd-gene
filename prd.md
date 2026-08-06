# Product Requirement Document: AI PRD Generator

## 1. Overview & Objective

AI PRD Generator adalah aplikasi web percakapan untuk membantu Product Manager,
Software Engineer, dan Founder mengubah ide produk menjadi PRD yang terstruktur
dan siap diimplementasikan. MVP ditujukan untuk demonstrasi webinar tetapi tetap
memiliki validasi, keamanan dasar, pengujian, dan konfigurasi deployment yang
layak.

## 2. User Flow

1. Pengguna memberi judul dan menjelaskan ide produk.
2. AI mengajukan maksimal empat pertanyaan discovery tentang pengguna, masalah,
   fitur wajib, platform, dan batasan.
3. Pengguna dapat melampirkan PDF, TXT, Markdown, PNG, atau JPEG sebagai konteks.
4. Pengguna memilih **Generate PRD**.
5. Aplikasi menampilkan Markdown yang dapat disalin atau diunduh sebagai `.md`.

Riwayat, judul, metadata lampiran, dan draf disimpan di `localStorage`. Tidak ada
login, database, atau sinkronisasi lintas perangkat pada fase pertama.

## 3. Architecture & Technology

- Frontend: Next.js App Router, TypeScript, Tailwind CSS, Lucide React,
  `react-markdown`, dan `remark-gfm`.
- Backend: Node.js, Express, TypeScript, Multer, Zod, Helmet, CORS, dan rate limit.
- AI: 9Router melalui endpoint OpenAI-compatible dengan SDK resmi `openai`.
- Workspaces: `client/`, `server/`, dan `packages/contracts/`.

Konfigurasi server: `AI_BASE_URL` (default `http://127.0.0.1:20128/v1`),
`AI_API_KEY`, `AI_MODEL`, `PORT` (default `5001`), dan `CORS_ORIGIN`. Browser hanya menerima
`NEXT_PUBLIC_API_BASE_URL`.

## 4. API Requirements

### `POST /api/chat`

Menerima `{ messages, sessionId }` dan mengembalikan
`{ success: true, reply }`.

### `POST /api/upload`

Menerima `multipart/form-data` dengan `file` dan `sessionId`. File maksimal 10 MB,
divalidasi melalui extension, MIME, dan signature. Respons berisi ID opaque,
nama, MIME, ukuran, dan waktu kedaluwarsa—tanpa path server.

PDF/TXT/Markdown diekstrak di backend. Gambar dikirim sebagai data URL dan
memerlukan model vision. Hasil pemrosesan disimpan di memori selama 30 menit.

### `POST /api/generate-prd`

Menerima `{ history, productTitle, sessionId, fileIds }`. Markdown wajib berisi:

1. Overview & Objective
2. User Personas & Pain Points
3. Functional Requirements dengan tabel acceptance criteria
4. Non-Functional Requirements & Security
5. Recommended Tech Stack & System Architecture
6. Out of Scope (Phase 1)
7. Roadmap Implementasi yang memuat Phase 1 (MVP), Phase 2, dan Phase 3,
   termasuk tujuan, cakupan, dan kriteria selesai singkat setiap phase.

### Endpoint Pendukung

- `DELETE /api/uploads/:fileId`: menghapus lampiran milik sesi.
- `GET /api/health`: memeriksa server, 9Router, dan ketersediaan model tanpa
  membocorkan credential.

Error memakai `{ success: false, error: { code, message } }`, termasuk
`AI_UNAVAILABLE`, `AI_MODEL_NOT_FOUND`, `AI_TIMEOUT`, `MODEL_NO_VISION`,
`INVALID_UPLOAD`, `UPLOAD_EXPIRED`, `VALIDATION_ERROR`, dan `RATE_LIMITED`.

## 5. Interface Requirements

Desktop memakai layout 40% discovery dan 60% dokumen; mobile memakai tab.
Identitas “Product Workshop” menggunakan navy, cobalt, mist, paper, dan coral.
UI wajib memiliki empty, loading, disabled, retry, expired-file, dan connection
states, focus yang terlihat, serta dukungan reduced motion.

## 6. Acceptance Criteria

- Alur ide → discovery → lampiran → generate → copy/download berjalan.
- API key tidak pernah masuk bundle frontend atau log respons.
- Lampiran invalid, terlalu besar, asing, atau kedaluwarsa ditolak dengan jelas.
- Kegagalan router/model/timeout diterjemahkan menjadi pesan yang dapat ditindak.
- Type-check, lint, unit/integration tests, browser smoke test, dan production
  build lulus.

## 7. Out of Scope

Database, autentikasi, kolaborasi, streaming token, pemilih model, ekspor PDF,
custom template, dan histori lintas perangkat tidak termasuk fase pertama.
