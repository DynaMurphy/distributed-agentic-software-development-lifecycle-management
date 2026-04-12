import { streamText } from "ai";
import { getArtifactModel } from "@/lib/ai/providers";
import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { getFeatureById, getSubFeatures } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "feature" artifact kind.
 *
 * Feature artifacts are managed via the bitemporal `features` table.
 * The LLM can help draft or refine feature descriptions.
 */
export const featureDocumentHandler: DocumentHandler<"feature"> = {
  kind: "feature",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a product management assistant. Generate a structured feature description in JSON format with the following fields:
{
  "id": "<provided>",
  "title": "<provided>",
  "description": "<detailed feature description>",
  "feature_type": "feature",
  "status": "draft",
  "priority": "medium",
  "tags": [],
  "acceptance_criteria": "<list of acceptance criteria>"
}
Return ONLY valid JSON.`,
      prompt: `Create a feature titled "${title}" with ID "${id}".`,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-featureDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    // Feature artifacts save to bitemporal table via explicit save, not here
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    let draftContent = "";

    // Try to fetch the actual feature data
    let currentContent = document.content;
    try {
      const featureId = document.id;
      const feature = await getFeatureById(featureId);
      if (feature) {
        const subFeatures = await getSubFeatures(featureId);
        currentContent = JSON.stringify(
          { ...feature, sub_features: subFeatures },
          null,
          2
        );
      }
    } catch {
      // Use document content as fallback
    }

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a product management assistant updating a feature. Here is the current feature data:

${currentContent}

Apply the requested changes and return the complete updated feature as valid JSON.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-featureDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
};
