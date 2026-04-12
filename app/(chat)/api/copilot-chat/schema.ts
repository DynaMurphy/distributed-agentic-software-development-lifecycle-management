import { z } from "zod";

const textPartSchema = z.object({
  type: z.enum(["text"]),
  text: z.string().min(1).max(10000),
});

const filePartSchema = z.object({
  type: z.enum(["file"]),
  mediaType: z.enum(["image/jpeg", "image/png"]),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["user"]),
  parts: z.array(partSchema),
});

export const copilotChatRequestSchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema,
  selectedChatModel: z.string(),
  /** Optional: which SPLM agent to activate (triage, spec-writer, implementer, reviewer) */
  agent: z.string().optional(),
  /** Optional: Copilot session ID for resuming conversations */
  sessionId: z.string().optional(),
});

export type CopilotChatRequest = z.infer<typeof copilotChatRequestSchema>;
