import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  getBitemporalDocumentById,
  listBitemporalDocuments,
} from "@/lib/db/bitemporal-queries";
import type { ChatMessage } from "@/lib/types";
import { documentHandlersByArtifactKind } from "@/lib/artifacts/server";

type SpecDocumentToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
  /** Live markdown content from the editor, if available (includes unsaved edits) */
  liveSpecContent?: string | null;
  /** The document ID of the currently open spec, if any */
  liveSpecDocumentId?: string | null;
};

/**
 * AI tool: list all current spec documents from the bitemporal table.
 */
export const listSpecs = ({ session, dataStream }: SpecDocumentToolProps) =>
  tool({
    description:
      "List all specification documents available in the database. Returns titles and IDs that can be opened with the openSpec tool.",
    inputSchema: z.object({}),
    execute: async () => {
      const documents = await listBitemporalDocuments();

      if (documents.length === 0) {
        return {
          documents: [],
          message: "No specification documents found in the database.",
        };
      }

      return {
        documents: documents.map((doc) => ({
          id: doc.id,
          title: doc.title,
          lastModified: doc.valid_from,
        })),
        message: `Found ${documents.length} specification document(s).`,
      };
    },
  });

/**
 * AI tool: open an existing spec document from the bitemporal table in the artifact panel.
 */
export const openSpec = ({ session, dataStream }: SpecDocumentToolProps) =>
  tool({
    description:
      "Open an existing specification document from the database in the editor. The document will be displayed in the WYSIWYG markdown editor for collaborative editing.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the specification document to open"),
    }),
    execute: async ({ id }) => {
      const document = await getBitemporalDocumentById(id);

      if (!document) {
        return {
          error: "Specification document not found.",
        };
      }

      // Signal the artifact panel to open with this spec document
      dataStream.write({
        type: "data-kind",
        data: "spec" as any,
        transient: true,
      });

      dataStream.write({
        type: "data-id",
        data: id,
        transient: true,
      });

      dataStream.write({
        type: "data-title",
        data: document.title,
        transient: true,
      });

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      // Send the full content as the initial spec delta
      if (document.content) {
        dataStream.write({
          type: "data-specDelta",
          data: document.content,
          transient: true,
        });
      }

      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });

      return {
        id: document.id,
        title: document.title,
        kind: "spec",
        content:
          "The specification document has been opened in the editor. The user can now view and edit it.",
      };
    },
  });

/**
 * AI tool: update an open spec document based on a description of changes.
 * Uses the spec document handler to stream updated markdown content.
 */
export const updateSpec = ({ session, dataStream, liveSpecContent, liveSpecDocumentId }: SpecDocumentToolProps) =>
  tool({
    description:
      "Rewrite or generate content for a specification document. Use this when the document is empty " +
      "and needs initial content, or for major restructuring that requires rewriting large sections. " +
      "For targeted edits to an existing document with content, prefer editSpec instead.",
    inputSchema: z.object({
      id: z
        .string()
        .describe("The UUID of the specification document to update"),
      description: z
        .string()
        .describe("A description of what to write or the changes to make to the document"),
    }),
    execute: async ({ id, description }) => {
      const bitemporalDoc = await getBitemporalDocumentById(id);

      if (!bitemporalDoc) {
        return {
          error: "Specification document not found.",
        };
      }

      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      // Find the spec document handler
      const documentHandler = documentHandlersByArtifactKind.find(
        (handler) => handler.kind === "spec"
      );

      if (!documentHandler) {
        throw new Error("No document handler found for kind: spec");
      }

      // Use live editor content when available (includes unsaved edits and
      // reflects the actual current state), falling back to DB content.
      const currentContent =
        (id === liveSpecDocumentId && liveSpecContent)
          ? liveSpecContent
          : bitemporalDoc.content;

      // Create a Document-compatible object for the handler
      const docCompat = {
        id: bitemporalDoc.id,
        title: bitemporalDoc.title,
        content: currentContent,
        kind: "spec" as const,
        createdAt: bitemporalDoc.valid_from,
        userId: session.user?.id ?? "",
      };

      await documentHandler.onUpdateDocument({
        document: docCompat as any,
        description,
        dataStream,
        session,
      });

      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });

      return {
        id,
        title: bitemporalDoc.title,
        kind: "spec",
        content:
          "The specification document has been updated. The user can review the changes in the editor and save when ready.",
      };
    },
  });

/**
 * AI tool: make targeted surgical edits to an open spec document.
 *
 * Unlike `updateSpec` which rewrites the entire document, `editSpec` applies specific
 * find-and-replace edits on the markdown content. The user can then review changes
 * via the diff view.
 *
 * Uses the live editor content (from the client) when available, falling back to the
 * database version. This ensures the AI always operates on the latest document state
 * including unsaved user edits.
 */
export const editSpec = ({ session, dataStream, liveSpecContent, liveSpecDocumentId }: SpecDocumentToolProps) =>
  tool({
    description:
      "Make targeted edits to an open specification document. " +
      "Each edit specifies the exact original text to find and the replacement text. " +
      "Changes are applied directly to the markdown content and the user can review them. " +
      "Prefer this over updateSpec for specific, isolated changes. " +
      "Use updateSpec only for major restructuring that requires rewriting large sections. " +
      "The originalText must be an EXACT substring from the current document — even small " +
      "differences in whitespace or punctuation will cause a match failure.",
    inputSchema: z.object({
      edits: z
        .array(
          z.object({
            originalText: z
              .string()
              .describe(
                "The exact text to find in the document. Must be a precise substring. " +
                "Include enough context to uniquely identify the location (10-50 characters recommended)."
              ),
            newText: z
              .string()
              .describe("The replacement text to insert in place of originalText"),
            description: z
              .string()
              .optional()
              .describe("Brief description of why this change is being made"),
          })
        )
        .min(1)
        .max(20)
        .describe("Array of targeted edits to apply"),
    }),
    execute: async ({ edits }) => {
      // Determine the document ID — prefer the live context
      const documentId = liveSpecDocumentId;

      if (!documentId) {
        return {
          error:
            "No specification document is currently open. Use openSpec to open a document first.",
        };
      }

      // Get the current markdown content — prefer live (unsaved) content from the editor
      let currentContent: string | null = null;

      if (liveSpecContent) {
        currentContent = liveSpecContent;
      } else {
        // Fall back to database
        const dbDoc = await getBitemporalDocumentById(documentId);
        if (dbDoc?.content) {
          currentContent = dbDoc.content;
        }
      }

      if (!currentContent || currentContent.trim().length === 0) {
        return {
          error:
            "The document is empty — editSpec cannot find-and-replace text in an empty document. " +
            "Use updateSpec instead to write initial content for this document.",
          documentId,
          suggestion: "updateSpec",
        };
      }

      // Apply find-and-replace edits on the markdown content
      let editedContent = currentContent;
      const results: Array<{ success: boolean; error?: string }> = [];

      for (const edit of edits) {
        if (editedContent.includes(edit.originalText)) {
          editedContent = editedContent.replace(edit.originalText, edit.newText);
          results.push({ success: true });
        } else {
          results.push({
            success: false,
            error: `Text not found: "${edit.originalText.substring(0, 60)}..."`,
          });
        }
      }

      const successful = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      // Stream the edited document to the editor
      dataStream.write({
        type: "data-clear",
        data: null,
        transient: true,
      });

      dataStream.write({
        type: "data-specDelta",
        data: editedContent,
        transient: true,
      });

      dataStream.write({
        type: "data-finish",
        data: null,
        transient: true,
      });

      // Build result summary
      const summary: string[] = [];

      if (successful.length > 0) {
        summary.push(
          `Successfully applied ${successful.length} edit(s). The user can review the changes in the editor.`
        );
      }

      if (failed.length > 0) {
        summary.push(
          `Failed to apply ${failed.length} edit(s):`
        );
        for (let i = 0; i < failed.length; i++) {
          const failedEdit = edits[results.indexOf(failed[i])];
          summary.push(
            `  - "${failedEdit?.originalText.substring(0, 60)}...": ${failed[i].error}`
          );
        }
      }

      return {
        kind: "spec",
        documentId,
        appliedCount: successful.length,
        failedCount: failed.length,
        content: summary.join("\n"),
        failedEdits: failed.length > 0
          ? failed.map((f, i) => ({
              originalText: edits[results.indexOf(f)]?.originalText,
              error: f.error,
            }))
          : undefined,
      };
    },
  });

/**
 * AI tool: read the current content of an open spec document.
 * Returns the document content as markdown for the AI to understand,
 * using the live editor content when available.
 */
export const readSpec = ({ session, dataStream, liveSpecContent, liveSpecDocumentId }: SpecDocumentToolProps) =>
  tool({
    description:
      "Read the current content of an open specification document. " +
      "Returns the document as readable markdown so you can understand its structure and content " +
      "before making edits. Uses the live editor content (including unsaved changes) when available.",
    inputSchema: z.object({
      id: z
        .string()
        .optional()
        .describe(
          "The UUID of the specification document to read. If omitted, reads the currently open document."
        ),
    }),
    execute: async ({ id }) => {
      const targetId = id || liveSpecDocumentId;

      if (!targetId) {
        return {
          error:
            "No specification document is currently open and no ID was provided.",
        };
      }

      // Prefer live content for the currently open document
      let content: string | null = null;

      if (targetId === liveSpecDocumentId && liveSpecContent) {
        content = liveSpecContent;
      } else {
        const dbDoc = await getBitemporalDocumentById(targetId);
        if (dbDoc?.content) {
          content = dbDoc.content;
        }
      }

      if (!content) {
        return {
          error: "Could not retrieve document content.",
        };
      }

      return {
        documentId: targetId,
        content,
        message:
          "Here is the current content of the specification document. " +
          "This reflects the latest state including any unsaved edits the user has made.",
      };
    },
  });
