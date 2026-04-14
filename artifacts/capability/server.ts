import { streamText } from "ai";
import { getArtifactModel } from "@/lib/ai/providers";
import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { listCapabilities, getCapabilityById, getCapabilityItems } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "capability" artifact kind.
 *
 * Capabilities are functional SDLC areas that group features, bugs, and tasks.
 */
export const capabilityDocumentHandler: DocumentHandler<"capability"> = {
  kind: "capability",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    // Fetch current capabilities and stream them
    const capabilities = await listCapabilities({ status: "active" });
    const content = JSON.stringify(capabilities);

    dataStream.write({
      type: "data-capabilityDelta",
      data: content,
      transient: true,
    });
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    // Fetch fresh capabilities
    const capabilities = await listCapabilities({ status: "active" });
    const currentContent = JSON.stringify(capabilities, null, 2);

    let draftContent = "";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a product management assistant. Here are the current product capabilities:

${currentContent}

The user wants to: ${description}

Respond with a JSON analysis or updated view of the capabilities.`,
      prompt: description ?? "Analyze the current capabilities",
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-capabilityDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
};
