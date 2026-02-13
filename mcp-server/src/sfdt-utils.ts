interface SfdtContent {
  sections?: Section[];
  [key: string]: any;
}

interface Section {
  blocks?: Block[];
  [key: string]: any;
}

interface Block {
  inlines?: Inline[];
  paragraphFormat?: any;
  [key: string]: any;
}

interface Inline {
  text?: string;
  t?: string; // Minified text
  tlp?: string; // Minified text
  revisionIds?: string[];
  [key: string]: any;
}

interface Revision {
  author: string;
  date: string;
  id: string;
  revisionType: 'Insertion' | 'Deletion';
}

export class SfdtUtils {
  static sfdtToMarkdown(sfdtJson: string | object): string {
    try {
      const content = typeof sfdtJson === 'string' ? JSON.parse(sfdtJson) : sfdtJson;
      let markdown = '';
      
      // Handle both standard (expanded) and minified (optimized) SFDT formats
      const sections = content.sections || content.sec;

      if (sections) {
        for (const section of sections) {
          const blocks = section.blocks || section.b;
          if (blocks) {
            for (const block of blocks) {
              const inlines = block.inlines || block.i;
              if (inlines) {
                let paragraphText = '';
                for (const inline of inlines) {
                  // Text can be in 'text', 't', or 'tlp' (Text Layout Position/Property?)
                  const text = inline.text || inline.t || inline.tlp;
                  
                  // Check for deletions - skip text that is marked as deleted
                  // Note: In minified format, revisionIds might be under a different key, 
                  // but usually strict revisionIds array is preserved or accessible.
                  // For robust reading we should check deeper, but basic check:
                  const isDeleted = inline.revisionIds && inline.revisionIds.length > 0 && 
                                    content.revisions && 
                                    content.revisions.find((r: any) => r.id === inline.revisionIds[0] && r.revisionType === 'Deletion');

                  if (text && !isDeleted) {
                    paragraphText += text;
                  }
                }
                if (paragraphText.trim()) {
                  markdown += paragraphText + '\n\n';
                }
              }
            }
          }
        }
      }
      return markdown.trim();
    } catch (error) {
      console.error('Error parsing SFDT:', error);
      return 'Error: Could not parse document content.';
    }
  }

  static applyRevision(sfdtJson: string | object, originalText: string, newText: string): object {
    const content = typeof sfdtJson === 'string' ? JSON.parse(sfdtJson) : sfdtJson;

    // 1. Setup Revisions Array
    if (!content.revisions) {
      content.revisions = [];
    }

    const deletionId = crypto.randomUUID();
    const insertionId = crypto.randomUUID();
    const date = new Date().toISOString();

    content.revisions.push({
      author: "AI Assistant",
      date: date,
      id: deletionId,
      revisionType: "Deletion"
    });

    content.revisions.push({
      author: "AI Assistant",
      date: date,
      id: insertionId,
      revisionType: "Insertion"
    });

    // 2. Find and Replace
    // Searching for the text. This is a naive search that assumes the text is in a single Inline node.
    // A robust implementation requires traversing across multiple inlines.
    
    const sections = content.sections || content.sec;
    let found = false;

    if (sections) {
      for (const section of sections) {
        const blocks = section.blocks || section.b;
        if (blocks) {
          for (const block of blocks) {
            const inlines = block.inlines || block.i;
            if (inlines) {
              for (let i = 0; i < inlines.length; i++) {
                const inline = inlines[i];
                const currentText = inline.text || inline.t || inline.tlp;
                const textProp = inline.text ? 'text' : (inline.t ? 't' : 'tlp');

                if (currentText && currentText.includes(originalText)) {
                  // Found the text!
                  // We need to split this inline into up to 3 parts:
                  // [Before Part] [Deleted Part] [After Part] provided [Inserted Part]
                  
                  const parts = currentText.split(originalText);
                  const beforeText = parts[0];
                  const afterText = parts.slice(1).join(originalText); // Rejoin rest in case of multiple

                  const newInlines = [];

                  // Part 1: Text before
                  if (beforeText) {
                    newInlines.push({ ...inline, [textProp]: beforeText });
                  }

                  // Part 2: The marked-for-deletion text
                  newInlines.push({ 
                    ...inline, 
                    [textProp]: originalText,
                    revisionIds: [deletionId]
                  });

                  // Part 3: The new inserted text
                  newInlines.push({
                     ...inline,
                     [textProp]: newText,
                     revisionIds: [insertionId]
                  });

                  // Part 4: Text after
                  if (afterText) {
                    newInlines.push({ ...inline, [textProp]: afterText });
                  }

                  // Replace the single inline with our new set
                  inlines.splice(i, 1, ...newInlines);
                  
                  found = true;
                  break; // Stop after first match for safety
                }
              }
            }
            if (found) break;
          }
        }
        if (found) break;
      }
    }

    if (!found) {
        // Fallback: Append a paragraph if we couldn't find the text to replace
        // This ensures the update isn't lost.
        // Re-use insertionID
        const newBlock = {
            paragraphFormat: { styleName: 'Normal' },
            [sections[0].blocks ? 'inlines' : 'i']: [
                {
                    [sections[0].blocks ? 'text' : 't']: " [Change:] " + newText,
                    revisionIds: [insertionId]
                }
            ]
        };
        // Add to last section
        const lastSection = sections[sections.length - 1];
        const targetBlocks = lastSection.blocks || lastSection.b;
        targetBlocks.push(newBlock);
    }

    return content;
  }

  static appendNote(sfdtJson: string | object, note: string): object {
    const content: SfdtContent = typeof sfdtJson === 'string' ? JSON.parse(sfdtJson) : sfdtJson;

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

    // Create a new paragraph block for the note
    // Note: This is a simplified internal structure. 
    // Real SFDT might be more complex, but DocumentEditor is usually forgiving.
    const newBlock: Block = {
      paragraphFormat: { styleName: 'Normal' },
      inlines: [
        {
          characterFormat: { bold: true, bidi: false },
          text: '\n[AI Note]: '
        },
        {
           characterFormat: { bidi: false },
           text: note
        }
      ]
    };

    lastSection.blocks.push(newBlock);

    return content;
  }

  static createFromText(title: string, text: string): object {
    const paragraphs = text.split('\n');
    const blocks: Block[] = [];

    // Title Block
    blocks.push({
      paragraphFormat: { styleName: 'Heading 1', beforeSpacing: 12, afterSpacing: 12 },
      inlines: [{ 
        characterFormat: { bold: true, fontSize: 16, bidi: false }, 
        text: title 
      }]
    });

    // Content Blocks
    for (const para of paragraphs) {
      if (para.trim()) {
        blocks.push({
          paragraphFormat: { styleName: 'Normal', afterSpacing: 8 },
          inlines: [{ 
            characterFormat: { fontSize: 11, bidi: false }, 
            text: para 
          }]
        });
      }
    }

    return {
      sections: [{
        blocks: blocks,
        sectionFormat: {
          pageWidth: 612,
          pageHeight: 792,
          leftMargin: 72,
          rightMargin: 72,
          topMargin: 72,
          bottomMargin: 72
        }
      }],
      styles: [
        { name: 'Normal', type: 'Paragraph', paragraphFormat: { styleName: 'Normal' }, characterFormat: { fontSize: 11 } },
        { name: 'Heading 1', type: 'Paragraph', paragraphFormat: { styleName: 'Heading 1' }, characterFormat: { fontSize: 16, bold: true } }
      ]
    };
  }
}
