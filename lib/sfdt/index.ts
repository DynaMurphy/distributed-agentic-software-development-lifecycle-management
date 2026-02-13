/**
 * SFDT (Syncfusion Document Text) Utilities
 *
 * Provides bidirectional conversion between Markdown and SFDT format,
 * used as the bridge between AI-generated content (markdown) and the
 * Syncfusion Document Editor (SFDT JSON).
 */

/* ------------------------------------------------------------------ */
/*  TypeScript interfaces for SFDT structure                           */
/* ------------------------------------------------------------------ */

export interface SfdtDocument {
  sections?: SfdtSection[];
  sec?: SfdtSection[];
  characterFormat?: Record<string, unknown>;
  paragraphFormat?: Record<string, unknown>;
  styles?: SfdtStyle[];
  revisions?: SfdtRevision[];
  [key: string]: unknown;
}

export interface SfdtSection {
  blocks?: SfdtBlock[];
  b?: SfdtBlock[];
  sectionFormat?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SfdtBlock {
  inlines?: SfdtInline[];
  i?: SfdtInline[];
  paragraphFormat?: {
    styleName?: string;
    listFormat?: Record<string, unknown>;
    beforeSpacing?: number;
    afterSpacing?: number;
    [key: string]: unknown;
  };
  rows?: unknown[];
  [key: string]: unknown;
}

export interface SfdtInline {
  text?: string;
  t?: string;
  tlp?: string;
  characterFormat?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: string;
    fontSize?: number;
    fontFamily?: string;
    bidi?: boolean;
    [key: string]: unknown;
  };
  revisionIds?: string[];
  hasFieldEnd?: boolean;
  fieldType?: number;
  [key: string]: unknown;
}

export interface SfdtStyle {
  name: string;
  type: string;
  paragraphFormat?: Record<string, unknown>;
  characterFormat?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SfdtRevision {
  author: string;
  date: string;
  id: string;
  revisionType: "Insertion" | "Deletion";
}

/* ------------------------------------------------------------------ */
/*  Default SFDT document skeleton                                     */
/* ------------------------------------------------------------------ */

const DEFAULT_SECTION_FORMAT = {
  pageWidth: 612,
  pageHeight: 792,
  leftMargin: 72,
  rightMargin: 72,
  topMargin: 72,
  bottomMargin: 72,
  headerDistance: 36,
  footerDistance: 36,
};

const DEFAULT_STYLES: SfdtStyle[] = [
  {
    name: "Normal",
    type: "Paragraph",
    paragraphFormat: { afterSpacing: 8, lineSpacing: 1.15, lineSpacingType: "Multiple" },
    characterFormat: { fontSize: 11, fontFamily: "Calibri" },
  },
  {
    name: "Heading 1",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 12, afterSpacing: 4 },
    characterFormat: { fontSize: 20, bold: true, fontFamily: "Calibri" },
  },
  {
    name: "Heading 2",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 10, afterSpacing: 4 },
    characterFormat: { fontSize: 16, bold: true, fontFamily: "Calibri" },
  },
  {
    name: "Heading 3",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 8, afterSpacing: 4 },
    characterFormat: { fontSize: 14, bold: true, fontFamily: "Calibri" },
  },
  {
    name: "Heading 4",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 6, afterSpacing: 2 },
    characterFormat: { fontSize: 12, bold: true, italic: true, fontFamily: "Calibri" },
  },
  {
    name: "Heading 5",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 4, afterSpacing: 2 },
    characterFormat: { fontSize: 11, bold: true, fontFamily: "Calibri" },
  },
  {
    name: "Heading 6",
    type: "Paragraph",
    paragraphFormat: { beforeSpacing: 4, afterSpacing: 2 },
    characterFormat: { fontSize: 11, bold: true, italic: true, fontFamily: "Calibri" },
  },
];

/* ------------------------------------------------------------------ */
/*  Markdown → SFDT                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert a markdown string to an SFDT JSON object.
 *
 * Supports: headings (# – ######), bold (**), italic (*), bold-italic (***),
 * unordered lists (- / *), ordered lists (1.), horizontal rules (---),
 * and plain paragraphs.
 */
export function markdownToSfdt(markdown: string): SfdtDocument {
  const lines = markdown.split("\n");
  const blocks: SfdtBlock[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      // SFDT doesn't have a native HR, represent as a separator paragraph
      blocks.push({
        paragraphFormat: { styleName: "Normal", afterSpacing: 8 },
        inlines: [{ text: "───────────────────────────────────", characterFormat: { fontSize: 8 } }],
      });
      i++;
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push({
        paragraphFormat: { styleName: `Heading ${level}` },
        inlines: parseInlineFormatting(text),
      });
      i++;
      continue;
    }

    // Unordered list item
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      const indent = Math.floor((ulMatch[1].length || 0) / 2);
      const text = ulMatch[2].trim();
      blocks.push({
        paragraphFormat: {
          styleName: "Normal",
          listFormat: {
            listId: 1,
            listLevelNumber: indent,
          },
        },
        inlines: parseInlineFormatting(text),
      });
      i++;
      continue;
    }

    // Ordered list item
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      const indent = Math.floor((olMatch[1].length || 0) / 2);
      const text = olMatch[2].trim();
      blocks.push({
        paragraphFormat: {
          styleName: "Normal",
          listFormat: {
            listId: 2,
            listLevelNumber: indent,
          },
        },
        inlines: parseInlineFormatting(text),
      });
      i++;
      continue;
    }

    // Normal paragraph
    blocks.push({
      paragraphFormat: { styleName: "Normal", afterSpacing: 8 },
      inlines: parseInlineFormatting(line.trim()),
    });
    i++;
  }

  // Ensure there's always at least one block
  if (blocks.length === 0) {
    blocks.push({
      paragraphFormat: { styleName: "Normal" },
      inlines: [{ text: "" }],
    });
  }

  return {
    sections: [
      {
        blocks,
        sectionFormat: { ...DEFAULT_SECTION_FORMAT },
      },
    ],
    styles: [...DEFAULT_STYLES],
    characterFormat: { fontSize: 11, fontFamily: "Calibri" },
    paragraphFormat: { afterSpacing: 8, lineSpacing: 1.15, lineSpacingType: "Multiple" },
  };
}

/**
 * Parse inline markdown formatting (bold, italic, bold-italic) into SFDT inlines.
 */
function parseInlineFormatting(text: string): SfdtInline[] {
  const inlines: SfdtInline[] = [];

  // Regex to match bold-italic (***), bold (**), italic (*), or plain text
  // Order matters: bold-italic first, then bold, then italic
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|([^*`]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // Bold-italic ***text***
      inlines.push({
        text: match[2],
        characterFormat: { bold: true, italic: true, bidi: false },
      });
    } else if (match[3]) {
      // Bold **text**
      inlines.push({
        text: match[3],
        characterFormat: { bold: true, bidi: false },
      });
    } else if (match[4]) {
      // Italic *text*
      inlines.push({
        text: match[4],
        characterFormat: { italic: true, bidi: false },
      });
    } else if (match[5]) {
      // Inline code `text`
      inlines.push({
        text: match[5],
        characterFormat: { fontFamily: "Consolas", fontSize: 10, bidi: false },
      });
    } else if (match[6]) {
      // Plain text
      inlines.push({
        text: match[6],
        characterFormat: { bidi: false },
      });
    }
  }

  // Ensure we always have at least one inline
  if (inlines.length === 0) {
    inlines.push({ text: text, characterFormat: { bidi: false } });
  }

  return inlines;
}

/* ------------------------------------------------------------------ */
/*  SFDT → Markdown                                                    */
/* ------------------------------------------------------------------ */

/**
 * Convert an SFDT JSON object (or JSON string) to a markdown string.
 *
 * Extracts text content, respects heading styles, bold/italic formatting,
 * and filters out text marked with Deletion revisions.
 */
export function sfdtToMarkdown(sfdtJson: string | SfdtDocument): string {
  try {
    const content: SfdtDocument =
      typeof sfdtJson === "string" ? JSON.parse(sfdtJson) : sfdtJson;

    const lines: string[] = [];
    const sections = content.sections || content.sec;

    if (!sections) return "";

    for (const section of sections) {
      const blocks = section.blocks || section.b;
      if (!blocks) continue;

      for (const block of blocks) {
        const inlines = block.inlines || block.i;
        if (!inlines) continue;

        let paragraphText = "";

        for (const inline of inlines) {
          const text = inline.text || inline.t || inline.tlp;
          if (!text) continue;

          // Skip deleted revisions
          const isDeleted =
            inline.revisionIds &&
            inline.revisionIds.length > 0 &&
            content.revisions &&
            content.revisions.some(
              (r) =>
                inline.revisionIds!.includes(r.id) &&
                r.revisionType === "Deletion"
            );

          if (isDeleted) continue;

          // Apply inline formatting
          const isBold = inline.characterFormat?.bold;
          const isItalic = inline.characterFormat?.italic;

          let formattedText = text;
          if (isBold && isItalic) {
            formattedText = `***${text}***`;
          } else if (isBold) {
            formattedText = `**${text}**`;
          } else if (isItalic) {
            formattedText = `*${text}*`;
          }

          paragraphText += formattedText;
        }

        // Determine paragraph style / heading level
        const styleName = block.paragraphFormat?.styleName || "Normal";
        const headingMatch = styleName.match(/^Heading\s+(\d)$/i);

        if (headingMatch) {
          const level = Number.parseInt(headingMatch[1], 10);
          const prefix = "#".repeat(level);
          lines.push(`${prefix} ${paragraphText.trim()}`);
        } else if (block.paragraphFormat?.listFormat) {
          // List items
          const listId = (block.paragraphFormat.listFormat as Record<string, unknown>).listId;
          const level = ((block.paragraphFormat.listFormat as Record<string, unknown>).listLevelNumber as number) || 0;
          const indent = "  ".repeat(level);

          if (listId === 2) {
            // Ordered list
            lines.push(`${indent}1. ${paragraphText.trim()}`);
          } else {
            // Unordered list
            lines.push(`${indent}- ${paragraphText.trim()}`);
          }
        } else {
          if (paragraphText.trim()) {
            lines.push(paragraphText.trim());
          } else {
            lines.push("");
          }
        }
      }
    }

    return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch (error) {
    console.error("Error converting SFDT to markdown:", error);
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Revision helpers (for AI-suggested changes / track changes)        */
/* ------------------------------------------------------------------ */

/**
 * Apply a tracked change (revision) to an SFDT document.
 * Marks the original text as a Deletion and inserts new text as an Insertion,
 * both attributed to the given author.
 */
export function applyRevision(
  sfdtJson: string | SfdtDocument,
  originalText: string,
  newText: string,
  author = "AI Assistant"
): SfdtDocument {
  const content: SfdtDocument =
    typeof sfdtJson === "string" ? JSON.parse(sfdtJson) : sfdtJson;

  if (!content.revisions) {
    content.revisions = [];
  }

  const deletionId = crypto.randomUUID();
  const insertionId = crypto.randomUUID();
  const date = new Date().toISOString();

  content.revisions.push({
    author,
    date,
    id: deletionId,
    revisionType: "Deletion",
  });

  content.revisions.push({
    author,
    date,
    id: insertionId,
    revisionType: "Insertion",
  });

  const sections = content.sections || content.sec;
  let found = false;

  if (sections) {
    for (const section of sections) {
      if (found) break;
      const blocks = section.blocks || section.b;
      if (!blocks) continue;

      for (const block of blocks) {
        if (found) break;
        const inlines = block.inlines || block.i;
        if (!inlines) continue;

        for (let idx = 0; idx < inlines.length; idx++) {
          const inline = inlines[idx];
          const currentText = inline.text || inline.t || inline.tlp;
          const textProp = inline.text ? "text" : inline.t ? "t" : "tlp";

          if (currentText && currentText.includes(originalText)) {
            const parts = currentText.split(originalText);
            const beforeText = parts[0];
            const afterText = parts.slice(1).join(originalText);

            const newInlines: SfdtInline[] = [];

            if (beforeText) {
              newInlines.push({ ...inline, [textProp]: beforeText });
            }

            newInlines.push({
              ...inline,
              [textProp]: originalText,
              revisionIds: [deletionId],
            });

            newInlines.push({
              ...inline,
              [textProp]: newText,
              revisionIds: [insertionId],
            });

            if (afterText) {
              newInlines.push({ ...inline, [textProp]: afterText });
            }

            inlines.splice(idx, 1, ...newInlines);
            found = true;
            break;
          }
        }
      }
    }
  }

  if (!found) {
    // Fallback: append as a new note paragraph
    const lastSection = sections?.[sections.length - 1];
    const targetBlocks = lastSection?.blocks || lastSection?.b;
    if (targetBlocks) {
      targetBlocks.push({
        paragraphFormat: { styleName: "Normal" },
        inlines: [
          {
            text: `[Change:] ${newText}`,
            characterFormat: { bidi: false },
            revisionIds: [insertionId],
          },
        ],
      });
    }
  }

  return content;
}

/**
 * Append a note paragraph to the end of an SFDT document.
 */
export function appendNote(
  sfdtJson: string | SfdtDocument,
  note: string,
  author = "AI Assistant"
): SfdtDocument {
  const content: SfdtDocument =
    typeof sfdtJson === "string" ? JSON.parse(sfdtJson) : sfdtJson;

  if (!content.sections) {
    content.sections = [{ blocks: [] }];
  }
  if (content.sections.length === 0) {
    content.sections.push({ blocks: [] });
  }

  const lastSection = content.sections[content.sections.length - 1];
  if (!lastSection.blocks) {
    lastSection.blocks = [];
  }

  lastSection.blocks.push({
    paragraphFormat: { styleName: "Normal" },
    inlines: [
      {
        text: `\n[${author} Note]: `,
        characterFormat: { bold: true, bidi: false },
      },
      {
        text: note,
        characterFormat: { bidi: false },
      },
    ],
  });

  return content;
}
