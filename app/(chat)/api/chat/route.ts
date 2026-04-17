import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  generateId,
  stepCountIs,
  streamText,
} from "ai";
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";
import { auth, type UserType } from "@/app/(auth)/auth";
import { entitlementsByUserType } from "@/lib/ai/entitlements";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocument } from "@/lib/ai/tools/create-document";
import { getWeather } from "@/lib/ai/tools/get-weather";
import { requestSuggestions } from "@/lib/ai/tools/request-suggestions";
import { listSpecs, openSpec, updateSpec, editSpec, readSpec } from "@/lib/ai/tools/spec-document";
import { updateDocument } from "@/lib/ai/tools/update-document";
import {
  listFeatures,
  createFeature,
  updateFeature,
  getFeature,
} from "@/lib/ai/tools/feature-management";
import {
  listBugsAI,
  createBugAI,
  updateBugAI,
  getBugAI,
} from "@/lib/ai/tools/bug-management";
import {
  listTasksAI,
  createTaskAI,
  updateTaskAI,
} from "@/lib/ai/tools/task-management";
import {
  viewBacklog,
  promoteToBacklogAI,
  triageItem,
  detectDuplicates,
  analyzeImpact,
} from "@/lib/ai/tools/backlog-management";
import {
  linkDocumentAI,
  suggestDocumentLinks,
} from "@/lib/ai/tools/document-linking";
import { generateSpecFromFeature } from "@/lib/ai/tools/generate-spec-from-feature";
import { isProductionEnvironment } from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  updateChatTitleById,
  updateMessage,
} from "@/lib/db/queries";
import type { DBMessage } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID } from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}

export { getStreamContext };

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const { id, message, messages, selectedChatModel, selectedVisibilityType, liveSpecContext: liveSpecBody, navigationContext } =
      requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const isToolApprovalFlow = Boolean(messages);

    const chat = await getChatById({ id });
    let messagesFromDb: DBMessage[] = [];
    let titlePromise: Promise<string> | null = null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
      if (!isToolApprovalFlow) {
        messagesFromDb = await getMessagesByChatId({ id });
      }
    } else if (message?.role === "user") {
      await saveChat({
        id,
        userId: session.user.id,
        title: "New chat",
        visibility: selectedVisibilityType,
      });
      titlePromise = generateTitleFromUserMessage({ message });
    }

    const uiMessages = isToolApprovalFlow
      ? (messages as ChatMessage[])
      : [...convertToUIMessages(messagesFromDb), message as ChatMessage];

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    if (message?.role === "user") {
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
    }

    const isReasoningModel =
      selectedChatModel.includes("reasoning") ||
      selectedChatModel.includes("thinking");

    const modelMessages = await convertToModelMessages(uiMessages);

    // Extract live spec context from the request body (sent separately from message parts)
    let liveSpecContent: string | null = null;
    let liveSpecDocumentId: string | null = null;
    let liveSpecMarkdown: string | null = null;

    if (liveSpecBody) {
      liveSpecDocumentId = liveSpecBody.documentId;
      liveSpecContent = liveSpecBody.content;
      // Content is already markdown — no conversion needed
      liveSpecMarkdown = liveSpecContent;
    }

    // Build spec-aware system prompt supplement
    const isSpecEmpty = !liveSpecMarkdown || liveSpecMarkdown.trim().length === 0;
    const liveDocumentContext = liveSpecDocumentId
      ? isSpecEmpty
        ? `\n\n**Currently Open Specification Document (ID: ${liveSpecDocumentId}):**\nThe user has a specification document open but it is EMPTY — it has no content yet.\n\nIMPORTANT:\n- Do NOT use \`createDocument\` — a document is already open.\n- Do NOT use \`editSpec\` — the document is empty so there is nothing to find and replace.\n- Use \`updateSpec\` with the document ID \`${liveSpecDocumentId}\` to write initial content for this document.\n`
        : `\n\n**Currently Open Specification Document (ID: ${liveSpecDocumentId}):**\nThe user is currently editing a specification document in the editor. Below is its current content (including any unsaved edits). Refer to this when discussing or editing the document.\n\nIMPORTANT: Do NOT use \`createDocument\` — a document is already open. Use \`editSpec\` for targeted changes, \`updateSpec\` for major rewrites, or \`readSpec\` to get a fresh view of the content.\n\n---\n${liveSpecMarkdown}\n---\n`
      : "";

    // Build navigation context supplement for the system prompt
    const navigationContextPrompt = navigationContext
      ? `\n\n**User Navigation Context:**\nThe user is currently viewing: "${navigationContext.current.title}" (${navigationContext.current.kind}, ID: ${navigationContext.current.documentId})\nNavigation path: ${navigationContext.navigationPath.join(" → ")}\nNavigation depth: ${navigationContext.navigationDepth}\n\nIMPORTANT: The user's questions likely relate to what they are currently viewing. When they say "this feature", "this bug", "this item", etc., they mean the item shown above.\n- For a feature (kind: "feature"), use \`getFeature\` with the ID above, or \`listTasks\` to see its tasks.\n- For a bug (kind: "bug"), use \`getBug\` with the ID above.\n- For a backlog view (kind: "backlog"), use \`viewBacklog\` to see backlog items.\n- For a capability (kind: "capability"), look up the capability's linked features and bugs.\n- For a spec (kind: "spec"), the live spec content may already be provided separately.\n- For a milestone (kind: "milestone"), look up the milestone's items and status.\n\nAlways use the relevant SPLM tools to fetch current data about the viewed item before answering questions about it. Do NOT ask the user which item they mean — you already know from the navigation context.\n`
      : "";

    const stream = createUIMessageStream({
      originalMessages: isToolApprovalFlow ? uiMessages : undefined,
      execute: async ({ writer: dataStream }) => {
        const result = streamText({
          model: getLanguageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }) + liveDocumentContext + navigationContextPrompt,
          messages: modelMessages,
          stopWhen: stepCountIs(5),
          experimental_activeTools: isReasoningModel
            ? []
            : [
                "getWeather",
                "createDocument",
                "updateDocument",
                "requestSuggestions",
                "listSpecs",
                "openSpec",
                "updateSpec",
                "editSpec",
                "readSpec",
                // SPLM tools
                "listFeatures",
                "createFeature",
                "updateFeature",
                "getFeature",
                "listBugs",
                "createBug",
                "updateBug",
                "getBug",
                "listTasks",
                "createTask",
                "updateTask",
                "viewBacklog",
                "promoteToBacklog",
                "triageItem",
                "detectDuplicates",
                "analyzeImpact",
                "linkDocument",
                "suggestDocumentLinks",
                "generateSpecFromFeature",
              ],
          providerOptions: isReasoningModel
            ? {
                anthropic: {
                  thinking: { type: "enabled", budgetTokens: 10_000 },
                },
              }
            : undefined,
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({ session, dataStream }),
            listSpecs: listSpecs({ session, dataStream }),
            openSpec: openSpec({ session, dataStream }),
            updateSpec: updateSpec({ session, dataStream, liveSpecContent, liveSpecDocumentId }),
            editSpec: editSpec({ session, dataStream, liveSpecContent, liveSpecDocumentId }),
            readSpec: readSpec({ session, dataStream, liveSpecContent, liveSpecDocumentId }),
            // SPLM tools
            listFeatures: listFeatures({ session, dataStream }),
            createFeature: createFeature({ session, dataStream }),
            updateFeature: updateFeature({ session, dataStream }),
            getFeature: getFeature({ session, dataStream }),
            listBugs: listBugsAI({ session, dataStream }),
            createBug: createBugAI({ session, dataStream }),
            updateBug: updateBugAI({ session, dataStream }),
            getBug: getBugAI({ session, dataStream }),
            listTasks: listTasksAI({ session, dataStream }),
            createTask: createTaskAI({ session, dataStream }),
            updateTask: updateTaskAI({ session, dataStream }),
            viewBacklog: viewBacklog({ session, dataStream }),
            promoteToBacklog: promoteToBacklogAI({ session, dataStream }),
            triageItem: triageItem({ session, dataStream }),
            detectDuplicates: detectDuplicates({ session, dataStream }),
            analyzeImpact: analyzeImpact({ session, dataStream }),
            linkDocument: linkDocumentAI({ session, dataStream }),
            suggestDocumentLinks: suggestDocumentLinks({ session, dataStream }),
            generateSpecFromFeature: generateSpecFromFeature({ session, dataStream }),
          },
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: "stream-text",
          },
        });

        dataStream.merge(result.toUIMessageStream({ sendReasoning: true }));

        if (titlePromise) {
          const title = await titlePromise;
          dataStream.write({ type: "data-chat-title", data: title });
          updateChatTitleById({ chatId: id, title });
        }
      },
      generateId: generateUUID,
      onFinish: async ({ messages: finishedMessages }) => {
        if (isToolApprovalFlow) {
          for (const finishedMsg of finishedMessages) {
            const existingMsg = uiMessages.find((m) => m.id === finishedMsg.id);
            if (existingMsg) {
              await updateMessage({
                id: finishedMsg.id,
                parts: finishedMsg.parts,
              });
            } else {
              await saveMessages({
                messages: [
                  {
                    id: finishedMsg.id,
                    role: finishedMsg.role,
                    parts: finishedMsg.parts,
                    createdAt: new Date(),
                    attachments: [],
                    chatId: id,
                  },
                ],
              });
            }
          }
        } else if (finishedMessages.length > 0) {
          await saveMessages({
            messages: finishedMessages.map((currentMessage) => ({
              id: currentMessage.id,
              role: currentMessage.role,
              parts: currentMessage.parts,
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            })),
          });
        }
      },
      onError: () => "Oops, an error occurred!",
    });

    return createUIMessageStreamResponse({
      stream,
      async consumeSseStream({ stream: sseStream }) {
        if (!process.env.REDIS_URL) {
          return;
        }
        try {
          const streamContext = getStreamContext();
          if (streamContext) {
            const streamId = generateId();
            await createStreamId({ streamId, chatId: id });
            await streamContext.createNewResumableStream(
              streamId,
              () => sseStream
            );
          }
        } catch (_) {
          // ignore redis errors
        }
      },
    });
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}

export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const body = await request.json();
  const { title } = body;

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  await updateChatTitleById({ chatId: id, title: title.trim() });

  return Response.json({ id, title: title.trim() }, { status: 200 });
}
