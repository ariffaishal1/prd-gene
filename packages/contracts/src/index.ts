export type MessageRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  choices?: string[];
}

export interface UploadedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  expiresAt: string;
}

export type ApiErrorCode =
  | "AI_UNAVAILABLE"
  | "AI_MODEL_NOT_FOUND"
  | "AI_TIMEOUT"
  | "MODEL_NO_VISION"
  | "INVALID_UPLOAD"
  | "UPLOAD_EXPIRED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorBody {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export interface ChatRequest {
  messages: ChatMessage[];
  sessionId: string;
  model?: string;
}

export interface ChatResponse {
  success: true;
  reply: string;
  choices: string[];
}

export interface UploadResponse {
  success: true;
  file: UploadedFile;
}

export interface DeleteUploadRequest {
  sessionId: string;
}

export interface GeneratePrdRequest {
  history: ChatMessage[];
  productTitle?: string;
  sessionId: string;
  fileIds: string[];
  model?: string;
}

export interface GeneratePrdResponse {
  success: true;
  prdContent: string;
  productTitle: string;
}

export interface ModelsResponse {
  success: true;
  models: string[];
  activeModel: string;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  ai: {
    reachable: boolean;
    modelConfigured: boolean;
    modelAvailable: boolean;
    activeModel: string;
  };
}
