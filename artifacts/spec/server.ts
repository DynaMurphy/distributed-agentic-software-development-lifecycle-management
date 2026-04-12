import { streamText } from "ai";
import { specPrompt } from "@/lib/ai/prompts";
import { getArtifactModel } from "@/lib/ai/providers";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";
import type {
  CreateDocumentCallbackProps,
  DocumentHandler,
  UpdateDocumentCallbackProps,
} from "@/lib/artifacts/server";
import {
  createBitemporalDocument,
  getBitemporalDocumentById,
  saveBitemporalDocument,
} from "@/lib/db/bitemporal-queries";

/**
 * Server handler for the "spec" artifact kind.
 *
 * Unlike other artifact kinds, the spec handler does NOT auto-save to the
 * chat `Document` table. Content is saved exclusively to the bitemporal
 * `documents` table via the explicit Save button on the client.
 *
 * The LLM generates Markdown content directly.
 */
export const specDocumentHandler: DocumentHandler<"spec"> = {
  kind: "spec",

  /**
   * Create a new spec document. The LLM generates Markdown from a title/prompt.
   * Content is streamed to the client but NOT persisted until the user saves.
   */
  onCreateDocument: async ({
    id,
    title,
    dataStream,
    session,
    description,
  }: CreateDocumentCallbackProps) => {
    let draftContent = "";

    const baseInstruction = `Create a specification document titled "${title}". Generate the content as well-structured Markdown with proper headings, sections, and content appropriate for a technical specification.`;
    const prompt = description
      ? `${baseInstruction}\n\nUse the following feature context to generate comprehensive, detailed specification content:\n\n${description}`
      : baseInstruction;

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: specPrompt,
      prompt,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;
        draftContent += text;

        dataStream.write({
          type: "data-specDelta",
          data: text,
          transient: true,
        });
      }
    }

    // Persist an initial version to the bitemporal table so that
    // /api/spec-document?id=... does not return 404 after streaming.
    await createBitemporalDocument(id, title, draftContent.trim(), CHAT_ASSISTANT_USER_ID);
  },

  /**
   * Update an existing spec document. The LLM modifies the Markdown based on
   * a description of the desired changes.
   */
  onUpdateDocument: async ({
    document,
    description,
    dataStream,
    session,
  }: UpdateDocumentCallbackProps) => {
    let draftContent = "";

    // For spec documents, the content in the Document type may be the documentId
    // referencing the bitemporal table. Try to fetch the actual content.
    let currentContent = document.content;

    // If the content looks like a UUID (reference to bitemporal doc), fetch it
    if (
      currentContent &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        currentContent.trim()
      )
    ) {
      const bitemporalDoc = await getBitemporalDocumentById(
        currentContent.trim()
      );
      if (bitemporalDoc?.content) {
        currentContent = bitemporalDoc.content;
      }
    }

    const { fullStream } = streamText({
      model: getArtifactModel(),
      system: `${specPrompt}

You are updating an existing specification document. Here is the current document content in Markdown:

${currentContent}

Apply the requested changes while preserving the document structure. Return the complete updated Markdown.`,
      prompt: description,
    });

    for await (const delta of fullStream) {
      const { type } = delta;

      if (type === "text-delta") {
        const { text } = delta;
        draftContent += text;

        dataStream.write({
          type: "data-specDelta",
          data: text,
          transient: true,
        });
      }
    }

    // Persist the updated version to the bitemporal table so that
    // /api/spec-document?id=... returns up-to-date content.
    await saveBitemporalDocument(document.id, document.title ?? "", draftContent.trim(), CHAT_ASSISTANT_USER_ID);
  },
};
