import { streamText } from "ai";
import { getArtifactModel } from "@/lib/ai/providers";
import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { getBacklog } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "backlog" artifact kind.
 *
 * The backlog artifact is a read-oriented view. The LLM can help analyze
 * and suggest prioritization changes.
 */
export const backlogDocumentHandler: DocumentHandler<"backlog"> = {
  kind: "backlog",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    // Fetch current backlog and stream it to client
    const backlog = await getBacklog({});
    const content = JSON.stringify(backlog);

    dataStream.write({
      type: "data-backlogDelta",
      data: content,
      transient: true,
    });
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    // Fetch fresh backlog
    const backlog = await getBacklog({});
    const currentContent = JSON.stringify(backlog, null, 2);

    let draftContent = "";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a product management assistant. Here is the current product backlog:

${currentContent}

The user wants to make changes to the backlog. Provide the updated backlog as a JSON array with the same structure. Return ONLY valid JSON.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-backlogDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
};
