import { z } from "zod";

export const chatMessageSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(20_000),
  createdAt: z.string().datetime()
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(20),
  sessionId: z.string().uuid()
});

export const generatePrdRequestSchema = z.object({
  history: z.array(chatMessageSchema).min(1).max(20),
  productTitle: z.string().trim().max(120).optional().default(""),
  sessionId: z.string().uuid(),
  fileIds: z.array(z.string().uuid()).max(5)
});

export const deleteUploadRequestSchema = z.object({
  sessionId: z.string().uuid()
});
