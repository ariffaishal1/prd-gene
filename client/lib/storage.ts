import type { ChatMessage, UploadedFile } from "@prd-studio/contracts";

const STORAGE_KEY = "prd-studio:v1";

export interface StoredWorkspace {
  version: 1;
  sessionId: string;
  productTitle: string;
  messages: ChatMessage[];
  attachments: UploadedFile[];
  prdContent: string;
}

export function loadWorkspace(): StoredWorkspace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWorkspace;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function saveWorkspace(workspace: StoredWorkspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
}

export function clearWorkspace() {
  localStorage.removeItem(STORAGE_KEY);
}
