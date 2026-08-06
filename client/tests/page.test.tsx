import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Home from "@/app/page";

const prd = `# Reservasi Klinik\n\n## 1. Overview & Objective\n\nMembantu pengguna.\n\n## 2. User Personas & Pain Points`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function mockApi() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/api/health")) {
      return json({
        status: "ok",
        timestamp: new Date().toISOString(),
        ai: { reachable: true, modelConfigured: true, modelAvailable: true }
      });
    }
    if (url.endsWith("/api/chat")) {
      return json({ success: true, reply: "Siapa pengguna utama produk ini?", choices: ["Pasien klinik", "Staf pendaftaran", "Keduanya"] });
    }
    if (url.endsWith("/api/upload")) {
      return json(
        {
          success: true,
          file: {
            id: "22222222-2222-4222-8222-222222222222",
            filename: "brief.md",
            mimeType: "text/markdown",
            size: 10,
            expiresAt: new Date(Date.now() + 60_000).toISOString()
          }
        },
        201
      );
    }
    if (url.endsWith("/api/generate-prd")) return json({ success: true, prdContent: prd, productTitle: "Reservasi Klinik" });
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    return json({ success: false, error: { code: "INTERNAL_ERROR", message: "Tidak dikenal" } }, 500);
  });
}

describe("Ruang PRD", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockApi());
  });

  it("menjalankan discovery dan menyimpan workspace", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByLabelText("Pesan discovery"), "Aplikasi untuk pasien klinik");
    await user.click(screen.getByRole("button", { name: /Kirim/ }));

    expect(await screen.findByText("Siapa pengguna utama produk ini?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pasien klinik" })).toBeInTheDocument();
    await waitFor(() => expect(localStorage.getItem("prd-studio:v1")).toContain("Aplikasi untuk pasien klinik"));
  });

  it("menampilkan titik hijau saat 9Router online", async () => {
    render(<Home />);

    expect(await screen.findByLabelText("9Router online")).toHaveClass("bg-emerald-500");
    expect(screen.queryByText("9Router terhubung")).not.toBeInTheDocument();
  });

  it("merender Markdown pada balasan chatbot", async () => {
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({ status: "ok", timestamp: new Date().toISOString(), ai: { reachable: true, modelConfigured: true, modelAvailable: true } })
    );
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({ success: true, reply: "Pertanyaan tentang **Target Pengguna**.", choices: ["Pasien", "Staf", "Keduanya"] })
    );
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByLabelText("Pesan discovery"), "Aplikasi untuk pasien klinik");
    await user.click(screen.getByRole("button", { name: /Kirim/ }));

    expect(await screen.findByText("Target Pengguna", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText("**Target Pengguna**")).not.toBeInTheDocument();
  });

  it("mengirim pilihan chatbot saat diklik", async () => {
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "Saya ingin membuat aplikasi baru" }));
    await screen.findByText("Siapa pengguna utama produk ini?");

    const chatRequests = vi
      .mocked(fetch)
      .mock.calls.filter(([input]) => String(input).endsWith("/api/chat"));
    expect(chatRequests).toHaveLength(1);
    expect(JSON.parse(String(chatRequests[0]?.[1]?.body)).messages.at(-1).content).toBe("Saya ingin membuat aplikasi baru");
  });

  it("membuat PRD dari pilihan dan membuka editor dokumen", async () => {
    localStorage.setItem(
      "prd-studio:v1",
      JSON.stringify({
        version: 1,
        sessionId: "11111111-1111-4111-8111-111111111111",
        productTitle: "",
        messages: [
          {
            id: "ready",
            role: "assistant",
            content: "Konteks siap dibuat menjadi PRD.",
            createdAt: "2026-08-01T00:00:00.000Z",
            choices: ["Membuat PRD lengkap dengan struktur standar industri"]
          }
        ],
        attachments: [],
        prdContent: ""
      })
    );
    const user = userEvent.setup();
    render(<Home />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Mulai percakapan baru" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Membuat PRD lengkap dengan struktur standar industri" }));

    expect(await screen.findByRole("heading", { name: "1. Overview & Objective" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Editor PRD");
    expect(editor).toHaveValue(prd);
    fireEvent.change(editor, { target: { value: "# PRD revisi" } });
    expect(editor).toHaveValue("# PRD revisi");
    expect(
      vi.mocked(fetch).mock.calls.some(([input]) => String(input).endsWith("/api/generate-prd"))
    ).toBe(true);
  });

  it("membatasi workspace desktop agar chat dan dokumen memiliki scroll sendiri", () => {
    const { container } = render(<Home />);
    const workspace = container.querySelector("main");
    const spine = container.querySelector(".brief-spine");
    const scrollPanels = container.querySelectorAll(".scroll-slim");

    expect(workspace).toHaveClass("md:h-dvh", "md:min-h-0");
    expect(spine).toHaveClass("md:h-[calc(100dvh-24px)]", "md:min-h-0");
    expect(scrollPanels).toHaveLength(2);
    scrollPanels.forEach((panel) => expect(panel).toHaveClass("flex-1", "overflow-y-auto"));
  });

  it("mengunggah lampiran dan menghapusnya", async () => {
    const user = userEvent.setup();
    render(<Home />);
    const input = screen.getByLabelText("Lampirkan file").parentElement?.querySelector("input");
    expect(input).not.toBeNull();

    await user.upload(input as HTMLInputElement, new File(["# Brief"], "brief.md", { type: "text/markdown" }));
    expect(await screen.findByText("brief.md")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Hapus brief.md"));
    await waitFor(() => expect(screen.queryByText("brief.md")).not.toBeInTheDocument());
  });

  it("menghasilkan, menyalin, dan mengunduh PRD", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    render(<Home />);

    await user.type(screen.getByLabelText("Pesan discovery"), "Aplikasi untuk pasien klinik");
    await user.click(screen.getByRole("button", { name: /Kirim/ }));
    await screen.findByText("Siapa pengguna utama produk ini?");
    await user.click(screen.getByRole("button", { name: "Generate PRD" }));

    expect(await screen.findByRole("heading", { name: "1. Overview & Objective" })).toBeInTheDocument();
    expect(screen.getByText("Reservasi Klinik", { selector: "h2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Salin" }));
    expect(writeText).toHaveBeenCalledWith(prd);
    await user.click(screen.getByRole("button", { name: "Unduh .md" }));
    expect(click).toHaveBeenCalledOnce();
  });

  it("memindahkan respons PRD dari chat ke panel dokumen", async () => {
    vi.mocked(fetch).mockImplementation(mockApi());
    vi.mocked(fetch).mockImplementationOnce(async () =>
      json({
        status: "ok",
        timestamp: new Date().toISOString(),
        ai: { reachable: true, modelConfigured: true, modelAvailable: true }
      })
    );
    vi.mocked(fetch).mockImplementationOnce(async () => json({ success: true, reply: prd }));
    const user = userEvent.setup();
    render(<Home />);

    await user.type(screen.getByLabelText("Pesan discovery"), "Buatkan PRD sekarang");
    await user.click(screen.getByRole("button", { name: /Kirim/ }));

    expect(await screen.findByRole("heading", { name: "1. Overview & Objective" })).toBeInTheDocument();
    expect(screen.getByLabelText("Percakapan discovery")).not.toHaveTextContent("Membantu pengguna.");
  });

  it("mengirim maksimal 20 pesan terbaru saat chat dan membuat PRD", async () => {
    const messages = Array.from({ length: 21 }, (_, index) => ({
      id: `message-${index}`,
      role: "user" as const,
      content: `Konteks discovery ${index + 1}`,
      createdAt: "2026-08-01T00:00:00.000Z"
    }));
    localStorage.setItem(
      "prd-studio:v1",
      JSON.stringify({
        version: 1,
        sessionId: "11111111-1111-4111-8111-111111111111",
        productTitle: "Reservasi Klinik",
        messages,
        attachments: [],
        prdContent: ""
      })
    );
    const user = userEvent.setup();
    render(<Home />);

    await user.click(await screen.findByRole("button", { name: "Generate PRD" }));
    expect(await screen.findByRole("heading", { name: "1. Overview & Objective" })).toBeInTheDocument();

    const generateRequest = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input).endsWith("/api/generate-prd"));
    expect(generateRequest).toBeDefined();
    expect(JSON.parse(String(generateRequest?.[1]?.body)).history).toHaveLength(20);
  });

  it("memulihkan workspace dan menandai upload kedaluwarsa", async () => {
    localStorage.setItem(
      "prd-studio:v1",
      JSON.stringify({
        version: 1,
        sessionId: "11111111-1111-4111-8111-111111111111",
        productTitle: "Produk Lama",
        messages: [
          {
            id: "message",
            role: "user",
            content: "Konteks lama",
            createdAt: "2026-08-01T00:00:00.000Z"
          }
        ],
        attachments: [
          {
            id: "22222222-2222-4222-8222-222222222222",
            filename: "lama.pdf",
            mimeType: "application/pdf",
            size: 10,
            expiresAt: "2020-01-01T00:00:00.000Z"
          }
        ],
        prdContent: ""
      })
    );
    render(<Home />);

    expect(await screen.findByRole("heading", { name: "Produk Lama" })).toBeInTheDocument();
    expect(screen.getByText("Kedaluwarsa")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate PRD" })).toBeDisabled();
  });

  it("menjelaskan syarat saat tombol Generate PRD belum aktif", async () => {
    render(<Home />);

    expect(await screen.findByText("Kirim minimal satu pesan discovery terlebih dahulu.")).toBeInTheDocument();
  });

  it("menghapus workspace dan membuat sesi baru setelah reset dikonfirmasi", async () => {
    localStorage.setItem(
      "prd-studio:v1",
      JSON.stringify({
        version: 1,
        sessionId: "11111111-1111-4111-8111-111111111111",
        productTitle: "Produk Lama",
        messages: [
          { id: "message", role: "user", content: "Konteks lama", createdAt: "2026-08-01T00:00:00.000Z" }
        ],
        attachments: [],
        prdContent: prd
      })
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<Home />);

    await screen.findByRole("heading", { name: "Produk Lama" });
    await user.click(screen.getByRole("button", { name: "Mulai percakapan baru" }));

    expect(screen.queryByText("Judul akan dibuat otomatis saat PRD dihasilkan.")).not.toBeInTheDocument();
    expect(screen.queryByText("Konteks lama")).not.toBeInTheDocument();
    expect(screen.getByText("PRD belum diberi judul")).toBeInTheDocument();
    await waitFor(() => {
      const workspace = JSON.parse(localStorage.getItem("prd-studio:v1") ?? "{}");
      expect(workspace.sessionId).not.toBe("11111111-1111-4111-8111-111111111111");
      expect(workspace.messages).toHaveLength(1);
      expect(workspace.messages[0].id).toBe("welcome");
      expect(workspace.prdContent).toBe("");
    });
  });

  it("menampilkan error dan dapat mencoba ulang", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementationOnce(async () => json({ status: "degraded", timestamp: "", ai: {} }));
    fetchMock.mockImplementationOnce(async () =>
      json({ success: false, error: { code: "AI_UNAVAILABLE", message: "9Router belum aktif." } }, 502)
    );
    fetchMock.mockImplementationOnce(async () =>
      json({ success: true, reply: "Siapa pengguna utamanya?" })
    );
    const user = userEvent.setup();
    render(<Home />);
    await user.type(screen.getByLabelText("Pesan discovery"), "Ide produk");
    fireEvent.click(screen.getByRole("button", { name: /Kirim/ }));

    expect(await screen.findByText("9Router belum aktif.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Coba lagi" }));
    expect(await screen.findByText("Siapa pengguna utamanya?")).toBeInTheDocument();
  });
});
