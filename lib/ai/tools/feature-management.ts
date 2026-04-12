import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  listFeatures as listFeaturesDB,
  getFeatureById,
  getSubFeatures,
  createFeature as createFeatureDB,
  updateFeature as updateFeatureDB,
  promoteToBacklog,
} from "@/lib/db/bitemporal-work-items";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";

type FeatureToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: list features with optional filters.
 */
export const listFeatures = ({ session, dataStream }: FeatureToolProps) =>
  tool({
    description:
      "List all features in the system. Can filter by status, priority, or type. Returns feature titles, IDs, status, and priority.",
    inputSchema: z.object({
      status: z
        .enum([
          "draft",
          "triage",
          "backlog",
          "spec_generation",
          "implementation",
          "testing",
          "done",
          "rejected",
        ])
        .optional()
        .describe("Filter by cascade status"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Filter by priority"),
      featureType: z
        .enum(["feature", "sub_feature"])
        .optional()
        .describe("Filter by feature type"),
    }),
    execute: async ({ status, priority, featureType }) => {
      const features = await listFeaturesDB({
        status,
        priority,
        featureType,
      });

      if (features.length === 0) {
        return {
          features: [],
          message: "No features found matching the criteria.",
        };
      }

      return {
        features: features.map((f) => ({
          id: f.id,
          title: f.title,
          type: f.feature_type,
          status: f.status,
          priority: f.priority,
          lastModified: f.valid_from,
        })),
        message: `Found ${features.length} feature(s).`,
      };
    },
  });

/**
 * AI tool: get a specific feature with full details.
 */
export const getFeature = ({ session, dataStream }: FeatureToolProps) =>
  tool({
    description:
      "Get full details of a specific feature by ID, including sub-features. Opens the feature in the artifact panel for viewing/editing.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the feature to open"),
    }),
    execute: async ({ id }) => {
      const feature = await getFeatureById(id);

      if (!feature) {
        return { error: "Feature not found." };
      }

      const subFeatures = await getSubFeatures(id);

      // Signal artifact panel to open with this feature
      dataStream.write({ type: "data-kind", data: "feature" as any, transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: feature.title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      // Send feature data as JSON
      const featureData = JSON.stringify({
        ...feature,
        subFeatures: subFeatures.map((sf) => ({
          id: sf.id,
          title: sf.title,
          status: sf.status,
          priority: sf.priority,
        })),
      });

      dataStream.write({
        type: "data-featureDelta",
        data: featureData,
        transient: true,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id: feature.id,
        title: feature.title,
        kind: "feature",
        content: `Feature "${feature.title}" has been opened in the editor. Status: ${feature.status}, Priority: ${feature.priority}.`,
      };
    },
  });

/**
 * AI tool: create a new feature. AI drafts a structured feature from natural language.
 */
export const createFeature = ({ session, dataStream }: FeatureToolProps) =>
  tool({
    description:
      "Create a new feature with structured details. AI should draft a clear title, description, priority, and type based on the user's natural language input.",
    inputSchema: z.object({
      title: z
        .string()
        .describe("Clear, concise feature title (max 100 chars)"),
      description: z
        .string()
        .describe(
          "Detailed feature description including user story, acceptance criteria, and any relevant context"
        ),
      featureType: z
        .enum(["feature", "sub_feature"])
        .default("feature")
        .describe("Whether this is a top-level feature or a sub-feature"),
      parentId: z
        .string()
        .optional()
        .describe(
          "Parent feature ID if this is a sub-feature (required for sub_feature type)"
        ),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .default("medium")
        .describe("Initial priority assessment"),
      effortEstimate: z
        .string()
        .optional()
        .describe("Effort estimate (S, M, L, XL or story points)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization"),
    }),
    execute: async ({
      title,
      description,
      featureType,
      parentId,
      priority,
      effortEstimate,
      tags,
    }) => {
      const id = generateUUID();
      const userId = session.user?.id;

      const versionId = await createFeatureDB({
        id,
        title,
        description,
        featureType,
        parentId,
        priority,
        effortEstimate,
        createdBy: userId,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Auto-add to backlog so the feature appears on the kanban board
      await promoteToBacklog({
        id: generateUUID(),
        itemType: "feature",
        itemId: id,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Open the newly created feature in the artifact panel
      dataStream.write({ type: "data-kind", data: "feature" as any, transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      const featureData = JSON.stringify({
        id,
        version_id: versionId,
        title,
        description,
        feature_type: featureType,
        parent_id: parentId ?? null,
        status: "draft",
        priority,
        effort_estimate: effortEstimate ?? null,
        created_by: userId ?? null,
        assigned_to: null,
        tags: tags ?? [],
        ai_metadata: {},
        subFeatures: [],
      });

      dataStream.write({
        type: "data-featureDelta",
        data: featureData,
        transient: true,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind: "feature",
        content: `Feature "${title}" has been created with status "draft" and priority "${priority}". It is now open in the editor for review.`,
      };
    },
  });

/**
 * AI tool: update an existing feature's fields.
 */
export const updateFeature = ({ session, dataStream }: FeatureToolProps) =>
  tool({
    description:
      "Update an existing feature's fields such as title, description, status, priority, effort estimate, or tags. Only specified fields will be changed.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the feature to update"),
      title: z.string().optional().describe("Updated title"),
      description: z.string().optional().describe("Updated description"),
      status: z
        .enum([
          "draft",
          "triage",
          "backlog",
          "spec_generation",
          "implementation",
          "testing",
          "done",
          "rejected",
        ])
        .optional()
        .describe("New cascade status"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Updated priority"),
      effortEstimate: z.string().optional().describe("Updated effort estimate"),
      assignedTo: z
        .string()
        .optional()
        .describe("User ID to assign the feature to"),
      tags: z.array(z.string()).optional().describe("Updated tags"),
    }),
    execute: async ({
      id,
      title,
      description,
      status,
      priority,
      effortEstimate,
      assignedTo,
      tags,
    }) => {
      const existing = await getFeatureById(id);
      if (!existing) {
        return { error: "Feature not found." };
      }

      await updateFeatureDB({
        id,
        title,
        description,
        status,
        priority,
        effortEstimate,
        assignedTo,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Reload and show updated feature
      const updated = await getFeatureById(id);
      if (updated) {
        const subFeatures = await getSubFeatures(id);
        dataStream.write({ type: "data-kind", data: "feature" as any, transient: true });
        dataStream.write({ type: "data-id", data: id, transient: true });
        dataStream.write({ type: "data-title", data: updated.title, transient: true });
        dataStream.write({ type: "data-clear", data: null, transient: true });
        dataStream.write({
          type: "data-featureDelta",
          data: JSON.stringify({
            ...updated,
            subFeatures: subFeatures.map((sf) => ({
              id: sf.id,
              title: sf.title,
              status: sf.status,
              priority: sf.priority,
            })),
          }),
          transient: true,
        });
        dataStream.write({ type: "data-finish", data: null, transient: true });
      }

      return {
        id,
        title: updated?.title ?? existing.title,
        kind: "feature",
        content: `Feature "${updated?.title ?? existing.title}" has been updated successfully.`,
      };
    },
  });
