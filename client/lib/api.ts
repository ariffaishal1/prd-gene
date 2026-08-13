import type {
  ApiErrorBody,
  ChatRequest,
  ChatResponse,
  GeneratePrdRequest,
  GeneratePrdResponse,
  HealthResponse,
  UploadResponse
} from "@prd-studio/contracts";

// API routes live inside Next.js (src/app/api/*), so we always use relative paths.
// No external server URL needed — requests go to /api/* on the same origin.
const API_BASE_URL = "";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  if (response.status === 204) return undefined as T;
  const body = (await response.json()) as T | ApiErrorBody;
  if (!response.ok) {
    const error = body as ApiErrorBody;
    throw new ApiError(error.error?.code ?? "INTERNAL_ERROR", error.error?.message ?? "Permintaan gagal.", response.status);
  }
  return body as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  health: () => request<HealthResponse>("/api/health"),
  chat: (body: ChatRequest) =>
    request<ChatResponse>("/api/chat", { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) }),
  generatePrd: (body: GeneratePrdRequest) =>
    request<GeneratePrdResponse>("/api/generate-prd", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body)
    }),
  upload: (file: File, sessionId: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("sessionId", sessionId);
    return request<UploadResponse>("/api/upload", { method: "POST", body: form });
  },
  deleteUpload: (fileId: string, sessionId: string) =>
    request<void>(`/api/uploads/${fileId}`, {
      method: "DELETE",
      headers: jsonHeaders,
      body: JSON.stringify({ sessionId })
    })
};
