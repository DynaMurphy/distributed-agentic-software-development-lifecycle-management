import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
} from "ai";
import { auth } from "@/app/(auth)/auth";
import {
  getCopilotClient,
  getSplmMcpConfig,
  splmAgents,
  serverPermissionHandler,
} from "@/lib/copilot";
import { systemPrompt } from "@/lib/ai/prompts";
import {
  getChatById,
  saveChat,
  saveMessages,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";
import {
  copilotChatRequestSchema,
  type CopilotChatRequest,
} from "./schema";

export const maxDuration = 360;

/**
 * Map to track active Copilot sessions per chat.
 * Key: chatId, Value: sessionId
 */
const chatSessionMap = new Map<string, string>();

export async function POST(request: Request) {
  let requestBody: CopilotChatRequest;

  try {
    const json = await request.json();
    requestBody = copilotChatRequestSchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, selectedChatModel, agent, sessionId } = requestBody;

    const session = await auth();
    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    // Ensure chat exists
    const chat = await getChatById({ id });
    if (!chat) {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: "private",
      });
    } else if (chat.userId !== session.user.id) {
      return new ChatSDKError("forbidden:chat").toResponse();
    }

    // Save the user message
    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    // Extract text from user message parts
    const userPrompt = message.parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("\n");

    // Get or create Copilot client
    const client = await getCopilotClient();

    // Determine the model for the Copilot session
    // Copilot SDK expects model names like "claude-opus-4.5", not "anthropic/claude-opus-4.5"
    const copilotModel = selectedChatModel.includes("/")
      ? selectedChatModel.split("/").slice(1).join("/")
      : selectedChatModel;

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        // Reuse existing session or create a new one
        let copilotSessionId = sessionId ?? chatSessionMap.get(id);
        let copilotSession;

        if (copilotSessionId) {
          try {
            copilotSession = await client.resumeSession(copilotSessionId, {
              model: copilotModel,
              onPermissionRequest: serverPermissionHandler,
              mcpServers: getSplmMcpConfig(),
              customAgents: splmAgents,
              ...(agent ? { agent } : {}),
              workingDirectory: process.cwd(),
              streaming: true,
            });
          } catch {
            // Session expired or invalid — create new
            copilotSessionId = undefined;
          }
        }

        if (!copilotSession) {
          copilotSession = await client.createSession({
            model: copilotModel,
            onPermissionRequest: serverPermissionHandler,
            mcpServers: getSplmMcpConfig(),
            customAgents: splmAgents,
            ...(agent ? { agent } : {}),
            workingDirectory: process.cwd(),
            streaming: true,
            systemMessage: {
              mode: "append",
              content: systemPrompt({
                selectedChatModel,
                requestHints: {
                  latitude: undefined,
                  longitude: undefined,
                  city: undefined,
                  country: undefined,
                },
              }),
            },
          });

          chatSessionMap.set(id, copilotSession.sessionId);
        }

        // Track the assistant message
        const assistantMessageId = generateUUID();
        const textPartId = generateId();
        let assistantContent = "";
        let titleGenerated = false;
        let messageStarted = false;

        // Activity-based timeout: resets on every SDK event so long-running
        // agent tasks don't time out while actively working.
        const IDLE_TIMEOUT = 120_000; // 2 min inactivity
        const MAX_TIMEOUT = 300_000; // 5 min absolute max
        const startTime = Date.now();

        const idlePromise = new Promise<void>((resolve, reject) => {
          let idleTimer = setTimeout(() => {
            reject(new Error("Copilot session timed out (no activity for 2 min)"));
          }, IDLE_TIMEOUT);

          const absoluteTimer = setTimeout(() => {
            reject(new Error("Copilot session reached maximum duration (5 min)"));
          }, MAX_TIMEOUT);

          // Reset the idle timer whenever the agent shows activity
          const resetIdleTimer = () => {
            clearTimeout(idleTimer);
            if (Date.now() - startTime < MAX_TIMEOUT - IDLE_TIMEOUT) {
              idleTimer = setTimeout(() => {
                reject(new Error("Copilot session timed out (no activity for 2 min)"));
              }, IDLE_TIMEOUT);
            }
          };

          copilotSession.on("session.idle", () => {
            clearTimeout(idleTimer);
            clearTimeout(absoluteTimer);
            resolve();
          });

          copilotSession.on("session.error", (event: any) => {
            clearTimeout(idleTimer);
            clearTimeout(absoluteTimer);
            console.error("Copilot session error:", event.data);
            reject(new Error(`Copilot session error: ${JSON.stringify(event.data)}`));
          });

          // Reset idle timer on any activity
          copilotSession.on("assistant.streaming_delta", resetIdleTimer);
          copilotSession.on("assistant.message_delta", resetIdleTimer);
          copilotSession.on("tool.execution_start", resetIdleTimer);
          copilotSession.on("tool.execution_progress", resetIdleTimer);
          copilotSession.on("tool.execution_complete", resetIdleTimer);
          copilotSession.on("assistant.intent", resetIdleTimer);
          copilotSession.on("assistant.reasoning_delta", resetIdleTimer);
        });

        // Helper to start the message + step + text part on first delta
        const ensureMessageStarted = () => {
          if (!messageStarted) {
            messageStarted = true;
            dataStream.write({ type: "start", messageId: assistantMessageId });
            dataStream.write({ type: "start-step" });
            dataStream.write({ type: "text-start", id: textPartId });
          }
        };

        // --- Status streaming: show agent activity in the UI ---

        // Track whether we're currently inside a status block that needs closing
        let statusPartOpen = false;
        const statusPartId = generateId();

        const writeStatusUpdate = (text: string) => {
          ensureMessageStarted();
          // If we had a text part open, close it, write status, reopen text
          if (!statusPartOpen) {
            // Close current text part temporarily
            dataStream.write({ type: "text-end", id: textPartId });
            // Open a new text part for the status
            dataStream.write({ type: "text-start", id: statusPartId });
            statusPartOpen = true;
          }
          dataStream.write({ type: "text-delta", delta: text, id: statusPartId });
        };

        const closeStatusAndResumeText = () => {
          if (statusPartOpen) {
            dataStream.write({ type: "text-end", id: statusPartId });
            // Re-open the main text part
            dataStream.write({ type: "text-start", id: textPartId });
            statusPartOpen = false;
          }
        };

        // Stream agent intent
        copilotSession.on("assistant.intent", (event: any) => {
          const intent = event.data?.intent;
          if (intent) {
            writeStatusUpdate(`\n\n> 🔄 ${intent}\n\n`);
          }
        });

        // Stream tool execution start
        copilotSession.on("tool.execution_start", (event) => {
          const toolName = event.data.toolName;
          const mcpServer = (event.data as any).mcpServerName;
          const label = mcpServer ? `${mcpServer}/${toolName}` : toolName;
          writeStatusUpdate(`\n\n> ⚙️ Running tool: \`${label}\`\n\n`);
        });

        // Stream tool progress
        copilotSession.on("tool.execution_progress", (event: any) => {
          const message = event.data?.message ?? event.data?.status;
          if (message) {
            writeStatusUpdate(`\n> ⏳ ${message}\n`);
          }
        });

        // Stream tool completion
        copilotSession.on("tool.execution_complete", (event) => {
          const success = event.data.success;
          const toolCallId = event.data.toolCallId;
          writeStatusUpdate(`\n> ${success ? "✅" : "❌"} Tool ${toolCallId.slice(0, 8)}… ${success ? "completed" : "failed"}\n\n`);
        });

        // Stream subagent events
        copilotSession.on("subagent.started" as any, (event: any) => {
          const agentName = event.data?.agentName ?? event.data?.name ?? "sub-agent";
          writeStatusUpdate(`\n\n> 🤖 Delegating to ${agentName}…\n\n`);
        });

        copilotSession.on("subagent.completed" as any, (event: any) => {
          writeStatusUpdate(`\n> ✅ Sub-agent completed\n\n`);
        });

        // --- Main content streaming ---

        // Handle streaming text deltas
        copilotSession.on("assistant.streaming_delta", (event) => {
          const delta = (event.data as any).deltaContent ?? (event.data as any).delta ?? "";
          if (delta) {
            closeStatusAndResumeText();
            ensureMessageStarted();
            assistantContent += delta;
            dataStream.write({ type: "text-delta", delta, id: textPartId });
          }
        });

        // Also handle message_delta as fallback
        copilotSession.on("assistant.message_delta", (event) => {
          const delta = event.data.deltaContent;
          if (delta) {
            closeStatusAndResumeText();
            ensureMessageStarted();
            assistantContent += delta;
            dataStream.write({ type: "text-delta", delta, id: textPartId });
          }
        });

        // Capture final message content
        copilotSession.on("assistant.message", (event) => {
          assistantContent = event.data.content;
        });

        // Handle title changes
        copilotSession.on("session.title_changed" as any, (event: any) => {
          if (!titleGenerated) {
            titleGenerated = true;
            const title = event.data.title;
            dataStream.write({ type: "data-chat-title" as any, data: title });
            updateChatTitleById({ chatId: id, title });
          }
        });

        // Send the user message (non-blocking)
        await copilotSession.send({ prompt: userPrompt });

        // Wait for session to become idle
        try {
          await idlePromise;
        } catch (err) {
          console.error("[copilot] Session error or timeout:", err);
          // Close any open status part and ensure main text part is active
          closeStatusAndResumeText();
          // If we already started streaming, close the stream cleanly
          if (messageStarted) {
            // Write the error as visible text
            dataStream.write({
              type: "text-delta",
              delta: `\n\n> ⚠️ ${err instanceof Error ? err.message : "Session error"}\n`,
              id: textPartId,
            });
            dataStream.write({ type: "text-end", id: textPartId });
            dataStream.write({ type: "finish-step" });
            dataStream.write({ type: "finish", finishReason: "error" });
          }
          // Save whatever content we have
          if (assistantContent) {
            await saveMessages({
              messages: [
                {
                  id: assistantMessageId,
                  chatId: id,
                  role: "assistant",
                  parts: [{ type: "text", text: assistantContent }],
                  attachments: [],
                  createdAt: new Date(),
                },
              ],
            });
          }
          return;
        }

        // Close any trailing status part
        closeStatusAndResumeText();

        if (assistantContent) {
          // If no streaming deltas arrived, write the full content now
          if (!messageStarted) {
            ensureMessageStarted();
            dataStream.write({ type: "text-delta", delta: assistantContent, id: textPartId });
          }

          // Close text part, step, and message
          dataStream.write({ type: "text-end", id: textPartId });
          dataStream.write({ type: "finish-step" });
          dataStream.write({ type: "finish", finishReason: "stop" });

          // Save assistant message to DB
          await saveMessages({
            messages: [
              {
                id: assistantMessageId,
                chatId: id,
                role: "assistant",
                parts: [{ type: "text", text: assistantContent }],
                attachments: [],
                createdAt: new Date(),
              },
            ],
          });
        } else {
          console.warn("[copilot] No assistant content received");
          // Send a minimal valid message so the client doesn't hang
          if (!messageStarted) {
            ensureMessageStarted();
            dataStream.write({ type: "text-delta", delta: "*No response received from the model.*", id: textPartId });
          }
          dataStream.write({ type: "text-end", id: textPartId });
          dataStream.write({ type: "finish-step" });
          dataStream.write({ type: "finish", finishReason: "stop" });
        }
      },
      generateId: generateUUID,
      onError: () => "Oops, an error occurred!",
    });

    return createUIMessageStreamResponse({ stream });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error("Copilot chat error:", error);
    return new ChatSDKError("offline:chat").toResponse();
  }
}
