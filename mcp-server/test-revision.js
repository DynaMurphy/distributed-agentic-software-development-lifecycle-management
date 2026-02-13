import { query } from './build/db.js';
import { SfdtUtils } from './build/sfdt-utils.js';

async function main() {
  try {
    const originalText = "User and AI draft a spec.";
    const newText = "User and AI collaborate to draft a comprehensive specification.";
    
    console.log(`Attempting to replace: "${originalText}" with "${newText}" ...`);

    const result = await query('SELECT * FROM current_documents ORDER BY valid_from DESC LIMIT 1');
    if (result.rows.length === 0) {
      console.log("No documents found.");
      return;
    }

    const doc = result.rows[0];
    const updatedContent = SfdtUtils.applyRevision(doc.content, originalText, newText);
    
    // Check if revision happened - in a real scenario we'd write to DB
    // Here we just inspect the JSON
    const content = updatedContent;
    if (content.revisions && content.revisions.length >= 2) {
       console.log("Success! Revisions found:", content.revisions.length);
       console.log("Last Revision Type:", content.revisions[content.revisions.length-1].revisionType);
       
       // Update DB to verify persistence (optional but good for real confirmation)
       // console.log("Updating database...");
       // await query('UPDATE documents SET content = $1 WHERE id = $2', [JSON.stringify(updatedContent), doc.id]);
       // console.log("Database updated.");
    } else {
       console.log("Warning: No revisions added. Did it find the text?");
       // Inspect text to debug
       // console.log("Doc content extract:", JSON.stringify(content).substring(0, 500));
    }
    
    // Also verify sfdtToMarkdown doesn't show the deleted text?
    const md = SfdtUtils.sfdtToMarkdown(updatedContent);
    console.log("\nNew Markdown Preview:\n" + md);

  } catch (e) {
    console.error("Error testing revision:", e);
  }
}

main();
