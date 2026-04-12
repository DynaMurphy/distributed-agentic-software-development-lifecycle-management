/**
 * Migration script: Convert SFDT documents to Markdown.
 *
 * Reads all document versions from the database, detects SFDT JSON content,
 * converts it to Markdown, and updates the rows using version_id (primary key).
 *
 * Usage: POSTGRES_URL=... npx tsx scripts/migrate-sfdt-to-markdown.ts
 *        POSTGRES_URL=... npx tsx scripts/migrate-sfdt-to-markdown.ts --dry-run
 */
import postgres from "postgres";

const isDryRun = process.argv.includes("--dry-run");

/* ------------------------------------------------------------------ */
/*  Inline SFDT→Markdown conversion (self-contained, no external dep) */
/* ------------------------------------------------------------------ */

interface SfdtInline {
  text?: string;
  t?: string;
  tlp?: string;
  characterFormat?: { bold?: boolean; italic?: boolean; [k: string]: unknown };
  revisionIds?: string[];
}

interface SfdtBlock {
  inlines?: SfdtInline[];
  i?: SfdtInline[];
  paragraphFormat?: {
    styleName?: string;
    listFormat?: Record<string, unknown>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

interface SfdtSection {
  blocks?: SfdtBlock[];
  b?: SfdtBlock[];
  [k: string]: unknown;
}

interface SfdtDocument {
  sections?: SfdtSection[];
  sec?: SfdtSection[];
  revisions?: Array<{ id: string; revisionType: string; [k: string]: unknown }>;
  [k: string]: unknown;
}

function sfdtToMarkdown(sfdtJson: string): string {
  try {
    const content: SfdtDocument = JSON.parse(sfdtJson);
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

          const isDeleted =
            inline.revisionIds?.length &&
            content.revisions?.some(
              (r) => inline.revisionIds!.includes(r.id) && r.revisionType === "Deletion"
            );
          if (isDeleted) continue;

          const isBold = inline.characterFormat?.bold;
          const isItalic = inline.characterFormat?.italic;
          let formatted = text;
          if (isBold && isItalic) formatted = `***${text}***`;
          else if (isBold) formatted = `**${text}**`;
          else if (isItalic) formatted = `*${text}*`;

          paragraphText += formatted;
        }

        const styleName = block.paragraphFormat?.styleName || "Normal";
        const headingMatch = styleName.match(/^Heading\s+(\d)$/i);

        if (headingMatch) {
          const level = Number.parseInt(headingMatch[1], 10);
          lines.push(`${"#".repeat(level)} ${paragraphText.trim()}`);
        } else if (block.paragraphFormat?.listFormat) {
          const lf = block.paragraphFormat.listFormat as Record<string, unknown>;
          const lvl = (lf.listLevelNumber as number) || 0;
          const indent = "  ".repeat(lvl);
          lines.push(lf.listId === 2
            ? `${indent}1. ${paragraphText.trim()}`
            : `${indent}- ${paragraphText.trim()}`);
        } else {
          lines.push(paragraphText.trim() || "");
        }
      }
    }

    return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  } catch (e) {
    console.error("Conversion error:", e);
    return "";
  }
}

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

function isSfdt(content: string): boolean {
  if (!content.startsWith("{")) return false;
  try {
    const obj = JSON.parse(content);
    return !!(obj.sections || obj.sec);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Main migration                                                     */
/* ------------------------------------------------------------------ */

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) {
    console.error("POSTGRES_URL environment variable is not set");
    process.exit(1);
  }

  const sql = postgres(url);

  try {
    if (isDryRun) console.log("🔍 DRY RUN — no changes will be written.\n");
    else console.log("🚀 Starting SFDT → Markdown migration...\n");

    // Use version_id (PK) for reliable updates
    const rows = await sql`
      SELECT version_id, id, title, content, valid_from
      FROM documents
      ORDER BY id, valid_from
    `;

    console.log(`Found ${rows.length} document version(s) total.\n`);

    let converted = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rows) {
      if (!isSfdt(row.content)) {
        skipped++;
        continue;
      }

      try {
        const markdown = sfdtToMarkdown(row.content);
        if (!markdown) {
          console.log(`⚠️  [${row.id}] "${row.title}" — conversion produced empty result, skipping`);
          failed++;
          continue;
        }

        console.log(`✅ [${row.id}] "${row.title}" (${new Date(row.valid_from).toISOString()}) → ${markdown.length} chars markdown`);

        if (!isDryRun) {
          const result = await sql`
            UPDATE documents
            SET content = ${markdown}
            WHERE version_id = ${row.version_id}
          `;
          if (result.count === 0) {
            console.log(`   ⚠️ UPDATE matched 0 rows for version_id=${row.version_id}`);
            failed++;
            converted--; // undo the count
          }
        }

        converted++;
      } catch (err) {
        console.error(`❌ [${row.id}] "${row.title}" — ${err}`);
        failed++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Converted: ${converted}`);
    console.log(`Skipped (already markdown): ${skipped}`);
    console.log(`Failed: ${failed}`);
    if (isDryRun) console.log(`\n(dry run — no rows updated)`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
