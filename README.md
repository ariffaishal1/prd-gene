# Ruang PRD

Ruang PRD adalah workspace discovery berbahasa Indonesia yang mengubah percakapan
dan lampiran menjadi Product Requirement Document menggunakan model yang dirutekan
melalui 9Router.

## Persyaratan

- Node.js 22+
- npm 10+
- 9Router aktif dengan satu provider/model terhubung

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env
npm run dev
```

Isi `.env` dengan API key endpoint dan ID model dari dashboard 9Router. Secara
default backend mengakses `http://127.0.0.1:20128/v1`, berjalan pada port `5001`,
dan frontend pada port `3000`.

Buka [http://localhost:3000](http://localhost:3000). Status koneksi di header akan
menunjukkan apakah 9Router dan model yang dipilih tersedia.

## Verifikasi

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Tes menggunakan mock dan tidak mengirim permintaan atau menghabiskan token AI.

## Konfigurasi deployment

Deploy `client` dan `server` secara terpisah atau bersama. Atur
`NEXT_PUBLIC_API_BASE_URL` ke URL backend, `CORS_ORIGIN` ke origin frontend, dan
`AI_BASE_URL` ke instance 9Router yang dapat dijangkau server. Jangan pernah
menaruh `AI_API_KEY` pada environment frontend.

Lampiran hanya berada di memori backend selama 30 menit. Restart server atau
kedaluwarsa akan meminta pengguna mengunggah ulang file.
