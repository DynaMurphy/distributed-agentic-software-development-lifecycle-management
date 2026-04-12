import { generateText, tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";
import {
  getBacklog,
  getBacklogItemByItemId,
  promoteToBacklog,
  updateBacklogItem,
  getFeatureById,
  getBugById,
  listFeatures as listFeaturesDB,
  listBugs as listBugsDB,
  updateFeature as updateFeatureDB,
  updateBug as updateBugDB,
  getDocumentLinksWithTitles,
} from "@/lib/db/bitemporal-work-items";
import { listBitemporalDocuments } from "@/lib/db/bitemporal-queries";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { getLanguageModel } from "@/lib/ai/providers";

type BacklogToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: view the product backlog.
 */
export const viewBacklog = ({ session, dataStream }: BacklogToolProps) =>
  tool({
    description:
      "View the product backlog — a prioritized list of features and bugs. Can filter by sprint or item type. Opens the backlog view in the artifact panel.",
    inputSchema: z.object({
      sprintLabel: z
        .string()
        .optional()
        .describe("Filter by sprint/iteration label"),
      itemType: z
        .enum(["feature", "bug"])
        .optional()
        .describe("Filter by item type"),
    }),
    execute: async ({ sprintLabel, itemType }) => {
      const backlog = await getBacklog({ sprintLabel, itemType });

      // Open backlog in artifact panel
      dataStream.write({ type: "data-kind", data: "backlog" as any, transient: true });
      dataStream.write({ type: "data-id", data: "backlog-view", transient: true });
      dataStream.write({ type: "data-title", data: "Product Backlog", transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });
      dataStream.write({
        type: "data-backlogDelta",
        data: JSON.stringify(backlog),
        transient: true,
      });
      dataStream.write({ type: "data-finish", data: null, transient: true });

      if (backlog.length === 0) {
        return {
          backlog: [],
          message:
            "The backlog is empty. Promote features or bugs to the backlog using the promoteToBacklog tool.",
        };
      }

      return {
        backlog: backlog.map((item) => ({
          id: item.id,
          rank: item.rank,
          itemType: item.item_type,
          itemId: item.item_id,
          title: item.item_title,
          status: item.item_status,
          priority: item.item_priority,
          sprintLabel: item.sprint_label,
        })),
        message: `Backlog has ${backlog.length} item(s).`,
      };
    },
  });

/**
 * AI tool: promote a feature or bug to the backlog.
 */
export const promoteToBacklogAI = ({
  session,
  dataStream,
}: BacklogToolProps) =>
  tool({
    description:
      "Promote a feature or bug to the product backlog. This adds it to the prioritized backlog and sets its status to 'backlog'.",
    inputSchema: z.object({
      itemType: z
        .enum(["feature", "bug"])
        .describe("Type of item to promote"),
      itemId: z.string().describe("The UUID of the feature or bug to promote"),
      rank: z
        .number()
        .optional()
        .describe("Position in backlog (lower = higher priority). Auto-calculated if omitted."),
      sprintLabel: z
        .string()
        .optional()
        .describe("Sprint/iteration to assign to"),
      notes: z
        .string()
        .optional()
        .describe("Product manager notes for this backlog entry"),
    }),
    execute: async ({ itemType, itemId, rank, sprintLabel, notes }) => {
      // Check if already in backlog
      const existing = await getBacklogItemByItemId(itemType, itemId);
      if (existing) {
        return {
          error: `This ${itemType} is already in the backlog (rank #${existing.rank}).`,
        };
      }

      // Verify the item exists
      const item =
        itemType === "feature"
          ? await getFeatureById(itemId)
          : await getBugById(itemId);

      if (!item) {
        return { error: `${itemType} not found.` };
      }

      const backlogId = generateUUID();
      await promoteToBacklog({
        id: backlogId,
        itemType,
        itemId,
        rank,
        sprintLabel,
        notes,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Update the item's status to 'backlog'
      if (itemType === "feature") {
        await updateFeatureDB({ id: itemId, status: "backlog", maintainedBy: CHAT_ASSISTANT_USER_ID });
      } else {
        await updateBugDB({ id: itemId, status: "backlog", maintainedBy: CHAT_ASSISTANT_USER_ID });
      }

      return {
        backlogId,
        itemType,
        itemId,
        title: item.title,
        content: `"${item.title}" has been promoted to the backlog.`,
      };
    },
  });

/**
 * AI tool: triage a feature or bug — AI suggests priority, severity, effort, and rationale.
 */
export const triageItem = ({ session, dataStream }: BacklogToolProps) =>
  tool({
    description:
      "AI-assisted triage for a feature or bug. Analyzes the item and suggests priority, effort estimate, and provides a triage rationale. Updates the item's AI metadata with triage results.",
    inputSchema: z.object({
      itemType: z
        .enum(["feature", "bug"])
        .describe("Type of item to triage"),
      itemId: z.string().describe("The UUID of the feature or bug to triage"),
    }),
    execute: async ({ itemType, itemId }) => {
      const item =
        itemType === "feature"
          ? await getFeatureById(itemId)
          : await getBugById(itemId);

      if (!item) {
        return { error: `${itemType} not found.` };
      }

      // Use AI to generate triage assessment
      const triageResult = await generateText({
        model: getLanguageModel("anthropic/claude-haiku-4-5"),
        system: `You are a senior product manager performing triage on software ${itemType}s. Analyze the following ${itemType} and provide a JSON assessment with these fields:
- suggestedPriority: "critical" | "high" | "medium" | "low"
- suggestedEffort: "S" | "M" | "L" | "XL"
- rationale: A brief explanation of your assessment (2-3 sentences)
- riskLevel: "high" | "medium" | "low"
- suggestedSprint: A suggestion for when to schedule this (e.g., "next sprint", "backlog", "urgent - current sprint")
Output ONLY valid JSON.`,
        prompt: `Title: ${item.title}\nDescription: ${item.description ?? "No description"}\nCurrent Priority: ${item.priority}\nStatus: ${item.status}${
          itemType === "bug" && "severity" in item
            ? `\nSeverity: ${(item as any).severity}\nSteps to Reproduce: ${(item as any).steps_to_reproduce ?? "Not provided"}\nExpected Behavior: ${(item as any).expected_behavior ?? "Not provided"}\nActual Behavior: ${(item as any).actual_behavior ?? "Not provided"}`
            : ""
        }`,
      });

      let triageData: Record<string, unknown> = {};
      try {
        triageData = JSON.parse(triageResult.text);
      } catch {
        triageData = { rawAssessment: triageResult.text };
      }

      // Update AI metadata and status to 'triage'
      const aiMetadata = {
        ...(item.ai_metadata || {}),
        triage: {
          ...triageData,
          triagedAt: new Date().toISOString(),
        },
      };

      if (itemType === "feature") {
        await updateFeatureDB({
          id: itemId,
          status: "triage",
          aiMetadata,
          maintainedBy: CHAT_ASSISTANT_USER_ID,
        });
      } else {
        await updateBugDB({
          id: itemId,
          status: "triage",
          aiMetadata,
          maintainedBy: CHAT_ASSISTANT_USER_ID,
        });
      }

      return {
        itemType,
        itemId,
        title: item.title,
        triage: triageData,
        content: `Triage complete for "${item.title}". ${triageData.rationale ?? "Assessment stored in AI metadata."}`,
      };
    },
  });

/**
 * AI tool: detect duplicates for a feature or bug.
 */
export const detectDuplicates = ({
  session,
  dataStream,
}: BacklogToolProps) =>
  tool({
    description:
      "Detect potential duplicate features or bugs by comparing with existing items. Uses AI to assess similarity and returns ranked candidates.",
    inputSchema: z.object({
      itemType: z
        .enum(["feature", "bug"])
        .describe("Type of item to check"),
      itemId: z.string().describe("The UUID of the feature or bug to check"),
    }),
    execute: async ({ itemType, itemId }) => {
      const item =
        itemType === "feature"
          ? await getFeatureById(itemId)
          : await getBugById(itemId);

      if (!item) {
        return { error: `${itemType} not found.` };
      }

      // Get all items of the same type for comparison
      const allItems =
        itemType === "feature"
          ? await listFeaturesDB()
          : await listBugsDB();

      const otherItems = allItems.filter((i) => i.id !== itemId);

      if (otherItems.length === 0) {
        return {
          duplicates: [],
          message: "No other items to compare against.",
        };
      }

      // Use AI for duplicate detection
      const result = await generateText({
        model: getLanguageModel("anthropic/claude-haiku-4-5"),
        system: `You are analyzing ${itemType}s for potential duplicates. Compare the target item against the list of existing items and identify any that might be duplicates or very similar. Return a JSON array of objects with fields: id, title, similarityScore (0-100), reason. Only include items with similarityScore >= 40. Output ONLY valid JSON array.`,
        prompt: `Target ${itemType}:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nExisting ${itemType}s:\n${otherItems.map((i) => `- ID: ${i.id}, Title: ${i.title}`).join("\n")}`,
      });

      let duplicates: Array<{ id: string; title: string; similarityScore: number; reason: string }> = [];
      try {
        duplicates = JSON.parse(result.text);
      } catch {
        duplicates = [];
      }

      // Store results in AI metadata
      const aiMetadata = {
        ...(item.ai_metadata || {}),
        duplicateCheck: {
          candidates: duplicates,
          checkedAt: new Date().toISOString(),
        },
      };

      if (itemType === "feature") {
        await updateFeatureDB({ id: itemId, aiMetadata, maintainedBy: CHAT_ASSISTANT_USER_ID });
      } else {
        await updateBugDB({ id: itemId, aiMetadata, maintainedBy: CHAT_ASSISTANT_USER_ID });
      }

      return {
        itemType,
        itemId,
        duplicates,
        message:
          duplicates.length > 0
            ? `Found ${duplicates.length} potential duplicate(s) for "${item.title}".`
            : `No duplicates found for "${item.title}".`,
      };
    },
  });

/**
 * AI tool: analyze impact of a feature or bug on existing specs and backlog.
 */
export const analyzeImpact = ({ session, dataStream }: BacklogToolProps) =>
  tool({
    description:
      "Analyze the impact of a feature or bug on existing specification documents and backlog items. Uses AI to evaluate potential effects and dependencies.",
    inputSchema: z.object({
      itemType: z
        .enum(["feature", "bug"])
        .describe("Type of item to analyze"),
      itemId: z.string().describe("The UUID of the feature or bug to analyze"),
    }),
    execute: async ({ itemType, itemId }) => {
      const item =
        itemType === "feature"
          ? await getFeatureById(itemId)
          : await getBugById(itemId);

      if (!item) {
        return { error: `${itemType} not found.` };
      }

      // Get linked documents
      const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);

      // Get all spec documents
      const allSpecs = await listBitemporalDocuments();

      // Get current backlog
      const backlog = await getBacklog();

      // Use AI for impact analysis
      const result = await generateText({
        model: getLanguageModel("anthropic/claude-haiku-4-5"),
        system: `You are a senior technical analyst performing impact analysis. Analyze the ${itemType} and evaluate its potential impact on existing specifications and backlog items. Return a JSON object with:
- impactedSpecs: array of { specId, specTitle, impactLevel: "high"|"medium"|"low", description }
- impactedBacklogItems: array of { itemId, itemTitle, relationship: "blocks"|"blocked_by"|"related", description }
- overallRisk: "high"|"medium"|"low"
- summary: brief impact summary (2-3 sentences)
- recommendations: array of action items
Output ONLY valid JSON.`,
        prompt: `${itemType.toUpperCase()}:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\nPriority: ${item.priority}\nStatus: ${item.status}\n\nLinked Documents:\n${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}\n\nAll Specifications:\n${allSpecs.map((s) => `- ID: ${s.id}, Title: ${s.title}`).join("\n") || "None"}\n\nCurrent Backlog:\n${backlog.map((b) => `- ${b.item_title} (${b.item_type}, rank #${b.rank})`).join("\n") || "Empty"}`,
      });

      let impactData: Record<string, unknown> = {};
      try {
        impactData = JSON.parse(result.text);
      } catch {
        impactData = { rawAnalysis: result.text };
      }

      // Store in AI metadata
      const aiMetadata = {
        ...(item.ai_metadata || {}),
        impactAnalysis: {
          ...impactData,
          analyzedAt: new Date().toISOString(),
        },
      };

      if (itemType === "feature") {
        await updateFeatureDB({ id: itemId, aiMetadata, maintainedBy: CHAT_ASSISTANT_USER_ID });
      } else {
        await updateBugDB({ id: itemId, aiMetadata, maintainedBy: CHAT_ASSISTANT_USER_ID });
      }

      return {
        itemType,
        itemId,
        title: item.title,
        impact: impactData,
        content: `Impact analysis complete for "${item.title}". ${(impactData as any).summary ?? "Results stored in AI metadata."}`,
      };
    },
  });
