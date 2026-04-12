/**
 * Utilities for extracting live spec document context from chat messages.
 *
 * When a spec document is open in the editor, the client injects the current
 * markdown content as a specially marked text part in the user's message. This
 * allows the AI to operate on the latest (potentially unsaved) editor state
 * rather than the last-saved version in the database.
 */

const LIVE_SPEC_OPEN = "[LIVE_SPEC_CONTEXT:";
const LIVE_SPEC_CLOSE = "[/LIVE_SPEC_CONTEXT]";

export type LiveSpecContext = {
  /** The bitemporal document ID */
  documentId: string;
  /** The raw markdown string from the editor */
  markdownContent: string;
};

/**
 * Extract live spec context from a user message's text parts.
 * Returns null if no live spec context is present.
 */
export function extractLiveSpecContext(
  messageParts: Array<{ type: string; text?: string }>
): LiveSpecContext | null {
  for (const part of messageParts) {
    if (part.type !== "text" || !part.text) continue;

    const text = part.text;
    const openIdx = text.indexOf(LIVE_SPEC_OPEN);
    if (openIdx === -1) continue;

    const closeIdx = text.indexOf(LIVE_SPEC_CLOSE, openIdx);
    if (closeIdx === -1) continue;

    // Extract document ID from the opening tag
    const headerEnd = text.indexOf("]", openIdx);
    if (headerEnd === -1) continue;

    const header = text.substring(openIdx + LIVE_SPEC_OPEN.length, headerEnd);
    const docIdMatch = header.match(/documentId=([^\]]+)/);
    if (!docIdMatch) continue;

    const documentId = docIdMatch[1];

    // Extract the markdown content between the tags
    const markdownContent = text
      .substring(headerEnd + 2, closeIdx) // +2 for "]\n"
      .trim();

    return {
      documentId,
      markdownContent,
    };
  }

  return null;
}

/**
 * Strip live spec context markers from a text part, returning the clean user message.
 * Used to clean the user's message before storing in the database.
 */
export function stripLiveSpecContext(text: string): string {
  const openIdx = text.indexOf(LIVE_SPEC_OPEN);
  if (openIdx === -1) return text;

  const closeIdx = text.indexOf(LIVE_SPEC_CLOSE, openIdx);
  if (closeIdx === -1) return text;

  // Remove the entire [LIVE_SPEC_CONTEXT...] block
  const before = text.substring(0, openIdx);
  const after = text.substring(closeIdx + LIVE_SPEC_CLOSE.length);

  return (before + after).trim();
}
