import { streamText } from "ai";
import { getArtifactModel } from "@/lib/ai/providers";
import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import { getBugById } from "@/lib/db/bitemporal-work-items";

/**
 * Server handler for the "bug" artifact kind.
 *
 * Bug artifacts are managed via the bitemporal `bugs` table.
 * The LLM can help draft or refine bug descriptions.
 */
export const bugDocumentHandler: DocumentHandler<"bug"> = {
  kind: "bug",

  onCreateDocument: async ({
    id,
    title,
    dataStream,
  }: CreateDocumentCallbackProps) => {
    let draftContent = "";

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a QA and bug reporting assistant. Generate a structured bug report in JSON format with the following fields:
{
  "id": "<provided>",
  "title": "<provided>",
  "description": "<concise bug summary>",
  "severity": "major",
  "status": "draft",
  "priority": "medium",
  "steps_to_reproduce": "<numbered steps>",
  "expected_behavior": "<what should happen>",
  "actual_behavior": "<what actually happens>",
  "environment": "",
  "tags": []
}
Return ONLY valid JSON.`,
      prompt: `Create a bug report titled "${title}" with ID "${id}".`,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-bugDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },

  onUpdateDocument: async ({
    document,
    description,
    dataStream,
  }: UpdateDocumentCallbackProps) => {
    let draftContent = "";

    let currentContent = document.content;
    try {
      const bug = await getBugById(document.id);
      if (bug) {
        currentContent = JSON.stringify(bug, null, 2);
      }
    } catch {
      // Use document content as fallback
    }

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `You are a QA assistant updating a bug report. Here is the current bug data:

${currentContent}

Apply the requested changes and return the complete updated bug as valid JSON.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-bugDelta",
          data: delta.text,
          transient: true,
        });
      }
    }
  },
};
