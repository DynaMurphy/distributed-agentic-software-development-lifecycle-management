import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  executeTriageItem,
  executeDetectDuplicates,
  executeAnalyzeImpact,
  executeSuggestDocumentLinks,
  executeAcceptSuggestion,
  executeAIDesign,
  executeAIImplement,
  executeAITesting,
  executeAISignoff,
} from "@/lib/ai/tools/ai-tool-executors";
import {
  moveBacklogItemStatus,
  getBacklogItemByItemId,
} from "@/lib/db/bitemporal-work-items";

const VALID_TOOLS = [
  "triage",
  "detectDuplicates",
  "analyzeImpact",
  "suggestDocumentLinks",
  "acceptSuggestion",
  "aiDesign",
  "aiImplement",
  "aiTesting",
  "aiSignoff",
] as const;

type ToolName = (typeof VALID_TOOLS)[number];

/** Maps AI actions to the status they advance the item to */
const AI_ACTION_NEXT_STATUS: Partial<Record<ToolName, string>> = {
  triage: "triage",
  aiDesign: "spec_generation",
  aiImplement: "implementation",
  aiTesting: "testing",
  aiSignoff: "done",
};

/**
 * POST /api/ai-tools
 * Direct invocation of AI-powered SPLM tools from artifact UI.
 *
 * Body: { tool, itemType, itemId, documentId?, linkType? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const tool = body.tool as ToolName;
  const itemType = body.itemType as "feature" | "bug" | "task";
  const itemId = body.itemId as string;

  if (!tool || !VALID_TOOLS.includes(tool)) {
    return Response.json(
      { error: `Invalid tool. Must be one of: ${VALID_TOOLS.join(", ")}` },
      { status: 400 }
    );
  }

  if (!itemId) {
    return Response.json({ error: "itemId is required." }, { status: 400 });
  }

  try {
    switch (tool) {
      case "triage": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            { error: 'itemType must be "feature" or "bug" for triage.' },
            { status: 400 }
          );
        }
        const result = await executeTriageItem(
          itemType as "feature" | "bug",
          itemId
        );
        if ("error" in result) {
          return Response.json(result, { status: 404 });
        }
        // Auto-advance status via backlog
        const newStatus = AI_ACTION_NEXT_STATUS.triage!;
        await advanceItemStatus(itemType, itemId, newStatus, session.user.id);
        return Response.json({ ...result, newStatus }, { status: 200 });
      }

      case "detectDuplicates": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            {
              error:
                'itemType must be "feature" or "bug" for duplicate detection.',
            },
            { status: 400 }
          );
        }
        const result = await executeDetectDuplicates(
          itemType as "feature" | "bug",
          itemId
        );
        return Response.json(result, {
          status: "error" in result ? 404 : 200,
        });
      }

      case "analyzeImpact": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            {
              error:
                'itemType must be "feature" or "bug" for impact analysis.',
            },
            { status: 400 }
          );
        }
        const result = await executeAnalyzeImpact(
          itemType as "feature" | "bug",
          itemId
        );
        return Response.json(result, {
          status: "error" in result ? 404 : 200,
        });
      }

      case "suggestDocumentLinks": {
        if (
          !itemType ||
          !["feature", "bug", "task"].includes(itemType)
        ) {
          return Response.json(
            {
              error:
                'itemType must be "feature", "bug", or "task" for link suggestions.',
            },
            { status: 400 }
          );
        }
        const result = await executeSuggestDocumentLinks(itemType, itemId);
        return Response.json(result, {
          status: "error" in result ? 404 : 200,
        });
      }

      case "acceptSuggestion": {
        const documentId = body.documentId as string;
        const linkType = (body.linkType as string) ?? "specification";
        if (!documentId) {
          return Response.json(
            { error: "documentId is required for acceptSuggestion." },
            { status: 400 }
          );
        }
        const result = await executeAcceptSuggestion(
          itemType,
          itemId,
          documentId,
          linkType
        );
        return Response.json(result, {
          status: "error" in result ? 400 : 201,
        });
      }

      case "aiDesign": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            { error: 'itemType must be "feature" or "bug" for AI Design.' },
            { status: 400 }
          );
        }
        const result = await executeAIDesign(
          itemType as "feature" | "bug",
          itemId
        );
        if ("error" in result) {
          return Response.json(result, { status: 404 });
        }
        // Auto-advance status
        const newStatus = AI_ACTION_NEXT_STATUS.aiDesign!;
        await advanceItemStatus(itemType, itemId, newStatus, session.user.id);
        return Response.json({ ...result, newStatus }, { status: 200 });
      }

      case "aiImplement": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            { error: 'itemType must be "feature" or "bug" for AI Implement.' },
            { status: 400 }
          );
        }
        const result = await executeAIImplement(
          itemType as "feature" | "bug",
          itemId
        );
        if ("error" in result) {
          return Response.json(result, { status: 404 });
        }
        const newStatus = AI_ACTION_NEXT_STATUS.aiImplement!;
        await advanceItemStatus(itemType, itemId, newStatus, session.user.id);
        return Response.json({ ...result, newStatus }, { status: 200 });
      }

      case "aiTesting": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            { error: 'itemType must be "feature" or "bug" for AI Testing.' },
            { status: 400 }
          );
        }
        const result = await executeAITesting(
          itemType as "feature" | "bug",
          itemId
        );
        if ("error" in result) {
          return Response.json(result, { status: 404 });
        }
        const newStatus = AI_ACTION_NEXT_STATUS.aiTesting!;
        await advanceItemStatus(itemType, itemId, newStatus, session.user.id);
        return Response.json({ ...result, newStatus }, { status: 200 });
      }

      case "aiSignoff": {
        if (!itemType || !["feature", "bug"].includes(itemType)) {
          return Response.json(
            { error: 'itemType must be "feature" or "bug" for AI Signoff.' },
            { status: 400 }
          );
        }
        const result = await executeAISignoff(
          itemType as "feature" | "bug",
          itemId
        );
        if ("error" in result) {
          return Response.json(result, { status: 404 });
        }
        // Only advance to done if verdict is approved
        if (result.signoff.verdict === "approved") {
          const newStatus = AI_ACTION_NEXT_STATUS.aiSignoff!;
          await advanceItemStatus(itemType, itemId, newStatus, session.user.id);
          return Response.json({ ...result, newStatus }, { status: 200 });
        }
        // needs_work — stay at testing
        return Response.json({ ...result, newStatus: "testing" }, { status: 200 });
      }

      default:
        return Response.json({ error: "Unknown tool." }, { status: 400 });
    }
  } catch (err) {
    console.error("[AI Tools API]", err);
    return Response.json(
      { error: `Internal error: ${String(err)}` },
      { status: 500 }
    );
  }
}

/**
 * Helper: advance the underlying feature/bug to the next status.
 * Also updates the backlog item status if one exists.
 */
async function advanceItemStatus(
  itemType: string,
  itemId: string,
  newStatus: string,
  userId?: string
): Promise<void> {
  try {
    // Try to advance via backlog (will update both backlog + underlying entity)
    const backlogItem = await getBacklogItemByItemId(
      itemType as "feature" | "bug",
      itemId
    );
    if (backlogItem) {
      await moveBacklogItemStatus({
        backlogItemId: backlogItem.id,
        newStatus: newStatus as any,
        maintainedBy: userId,
      });
    }
  } catch {
    // Silently fail — the executor already updated the entity status
  }
}