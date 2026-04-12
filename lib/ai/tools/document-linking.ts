import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";
import {
  linkDocumentToItem,
  unlinkDocumentFromItem,
  getDocumentsForItem,
  getDocumentLinksWithTitles,
  getItemsForDocument,
  type ItemType,
  type LinkType,
} from "@/lib/db/bitemporal-work-items";
import { listBitemporalDocuments } from "@/lib/db/bitemporal-queries";
import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type DocLinkToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: link or unlink a document to/from a work item.
 */
export const linkDocumentAI = ({ session, dataStream }: DocLinkToolProps) =>
  tool({
    description:
      "Link or unlink a specification document to/from a feature, bug, or task. Multiple items can be linked to the same document.",
    inputSchema: z.object({
      action: z
        .enum(["link", "unlink"])
        .describe("Whether to create or remove a link"),
      itemType: z
        .enum(["feature", "bug", "task"])
        .describe("Type of work item"),
      itemId: z
        .string()
        .describe("The UUID of the work item"),
      documentId: z
        .string()
        .describe("The UUID of the specification document"),
      linkType: z
        .enum(["specification", "test_plan", "design", "reference"])
        .default("specification")
        .describe("Type of relationship between item and document"),
      linkId: z
        .string()
        .optional()
        .describe("The link ID to remove (required for unlink action)"),
    }),
    execute: async ({ action, itemType, itemId, documentId, linkType, linkId }) => {
      if (action === "link") {
        const id = generateUUID();
        await linkDocumentToItem({
          id,
          itemType: itemType as ItemType,
          itemId,
          documentId,
          linkType: linkType as LinkType,
          maintainedBy: CHAT_ASSISTANT_USER_ID,
        });

        return {
          linkId: id,
          content: `Document linked to ${itemType} successfully as "${linkType}".`,
        };
      }

      // Unlink
      if (!linkId) {
        // Find the link by item + document
        const links = await getDocumentsForItem(itemType as ItemType, itemId);
        const matchingLink = links.find((l) => l.document_id === documentId);
        if (!matchingLink) {
          return { error: "Link not found between this item and document." };
        }
        await unlinkDocumentFromItem(matchingLink.id);
      } else {
        await unlinkDocumentFromItem(linkId);
      }

      return {
        content: `Document unlinked from ${itemType} successfully.`,
      };
    },
  });

/**
 * AI tool: suggest document links for a work item based on content similarity.
 */
export const suggestDocumentLinks = ({
  session,
  dataStream,
}: DocLinkToolProps) =>
  tool({
    description:
      "AI suggests which specification documents are most relevant to a given feature, bug, or task based on content similarity analysis.",
    inputSchema: z.object({
      itemType: z
        .enum(["feature", "bug", "task"])
        .describe("Type of work item"),
      itemId: z
        .string()
        .describe("The UUID of the work item"),
    }),
    execute: async ({ itemType, itemId }) => {
      // Get item details based on type
      let item: { title: string; description: string | null } | null = null;

      if (itemType === "feature") {
        const { getFeatureById } = await import("@/lib/db/bitemporal-work-items");
        item = await getFeatureById(itemId);
      } else if (itemType === "bug") {
        const { getBugById } = await import("@/lib/db/bitemporal-work-items");
        item = await getBugById(itemId);
      } else if (itemType === "task") {
        const { getTaskById } = await import("@/lib/db/bitemporal-work-items");
        item = await getTaskById(itemId);
      }

      if (!item) {
        return { error: `${itemType} not found.` };
      }

      // Get all spec documents and existing links
      const allSpecs = await listBitemporalDocuments();
      const existingLinks = await getDocumentsForItem(itemType as ItemType, itemId);
      const linkedDocIds = new Set(existingLinks.map((l) => l.document_id));

      // Filter out already-linked documents
      const unlinkedSpecs = allSpecs.filter((s) => !linkedDocIds.has(s.id));

      if (unlinkedSpecs.length === 0) {
        return {
          suggestions: [],
          message:
            allSpecs.length === 0
              ? "No specification documents exist yet."
              : "All available specifications are already linked to this item.",
        };
      }

      // Use AI for relevance scoring
      const result = await generateText({
        model: getLanguageModel("anthropic/claude-haiku-4-5"),
        system: `You are analyzing the relevance of specification documents to a work item. Score each document's relevance (0-100) and suggest an appropriate link type. Return a JSON array of objects with: id, title, relevanceScore (0-100), suggestedLinkType ("specification"|"test_plan"|"design"|"reference"), reason. Only include items with relevanceScore >= 30. Sort by relevanceScore descending. Output ONLY valid JSON array.`,
        prompt: `Work Item (${itemType}):\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nAvailable Specification Documents:\n${unlinkedSpecs.map((s) => `- ID: ${s.id}, Title: ${s.title}`).join("\n")}`,
      });

      let suggestions: Array<{
        id: string;
        title: string;
        relevanceScore: number;
        suggestedLinkType: string;
        reason: string;
      }> = [];
      try {
        suggestions = JSON.parse(result.text);
      } catch {
        suggestions = [];
      }

      return {
        suggestions,
        existingLinks: existingLinks.map((l) => ({
          linkId: l.id,
          documentId: l.document_id,
          linkType: l.link_type,
        })),
        message:
          suggestions.length > 0
            ? `Found ${suggestions.length} potentially relevant document(s) for "${item.title}".`
            : `No strongly relevant unlinked documents found for "${item.title}".`,
      };
    },
  });
