import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";
import {
  getFeatureById,
  getSubFeatures,
  getBugById,
  listTasks,
  getDocumentLinksWithTitles,
  linkDocumentToItem,
} from "@/lib/db/bitemporal-work-items";
import {
  createBitemporalDocument,
  getBitemporalDocumentById,
} from "@/lib/db/bitemporal-queries";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";

type GenSpecToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: generate a specification document from a feature (and its sub-features, bugs, tasks).
 */
export const generateSpecFromFeature = ({
  session,
  dataStream,
}: GenSpecToolProps) =>
  tool({
    description:
      "Generate a comprehensive specification document from a feature and its related items (sub-features, linked bugs, tasks). Creates a new spec document and automatically links it to the feature.",
    inputSchema: z.object({
      featureId: z
        .string()
        .describe("The UUID of the feature to generate a spec from"),
      specTitle: z
        .string()
        .optional()
        .describe(
          "Custom title for the spec document. Defaults to 'Specification: <feature title>'"
        ),
      includeSubFeatures: z
        .boolean()
        .default(true)
        .describe("Whether to include sub-features in the spec"),
      includeTasks: z
        .boolean()
        .default(true)
        .describe("Whether to include task breakdowns in the spec"),
      includeLinkedBugs: z
        .boolean()
        .default(true)
        .describe(
          "Whether to include linked bug information (known issues) in the spec"
        ),
    }),
    execute: async ({
      featureId,
      specTitle,
      includeSubFeatures,
      includeTasks,
      includeLinkedBugs,
    }) => {
      // Gather the feature
      const feature = await getFeatureById(featureId);
      if (!feature) {
        return { error: "Feature not found." };
      }

      // Gather related data
      const subFeatures = includeSubFeatures
        ? await getSubFeatures(featureId)
        : [];
      const tasks = includeTasks
        ? await listTasks({ parentType: "feature", parentId: featureId })
        : [];
      const linkedDocs = await getDocumentLinksWithTitles("feature", featureId);

      // Build a comprehensive prompt for the spec handler
      const title = specTitle ?? `Specification: ${feature.title}`;

      const context = [
        `# Feature: ${feature.title}`,
        `Priority: ${feature.priority} | Status: ${feature.status}`,
        feature.description ? `\n## Description\n${feature.description}` : "",
        subFeatures.length > 0
          ? `\n## Sub-Features\n${subFeatures.map((sf) => `- ${sf.title} (${sf.status})`).join("\n")}`
          : "",
        tasks.length > 0
          ? `\n## Tasks\n${tasks.map((t) => `- ${t.title} (${t.status})`).join("\n")}`
          : "",
        linkedDocs.length > 0
          ? `\n## Existing Linked Documents\n${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n")}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      // Create new spec document
      const docId = generateUUID();

      // Signal artifact panel
      dataStream.write({
        type: "data-kind",
        data: "spec" as any,
        transient: true,
      });
      dataStream.write({ type: "data-id", data: docId, transient: true });
      dataStream.write({ type: "data-title", data: title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      // Use the spec document handler to generate markdown content
      const specHandler = documentHandlersByArtifactKind.find(
        (h) => h.kind === "spec"
      );

      if (!specHandler) {
        return { error: "Spec document handler not found." };
      }

      // Create the document with feature context for rich content generation
      await specHandler.onCreateDocument({
        id: docId,
        title,
        dataStream,
        session,
        description: context,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      // Link the new spec to the feature
      const linkId = generateUUID();
      await linkDocumentToItem({
        id: linkId,
        itemType: "feature",
        itemId: featureId,
        documentId: docId,
        linkType: "specification",
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      return {
        specId: docId,
        featureId,
        title,
        linkId,
        kind: "spec",
        content: `Specification document "${title}" has been generated and linked to feature "${feature.title}". The document is open in the editor for review and editing.`,
      };
    },
  });
