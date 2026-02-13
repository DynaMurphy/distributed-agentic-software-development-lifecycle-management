import { query } from './build/db.js';
import { SfdtUtils } from './build/sfdt-utils.js';

async function main() {
  try {
    const result = await query('SELECT * FROM documents ORDER BY updated_at DESC LIMIT 1');
    if (result.rows.length === 0) { throw new Error("No doc"); }
    const doc = result.rows[0];

    const note = `4. Functional Requirements
4.1 Document Management
- The system shall allow users to view the current specification documents in a rich-text editor.
- The system shall support "Track Changes" visualization (red strikethrough for deletions, green for insertions).
- The system must persist documents in SFDT format to PostgreSQL.

4.2 AI Collaboration
- The system must provide an MCP server to expose document operations to AI agents.
- AI Agents must be able to read the latest version of the spec.
- AI Agents must be able to propose granular changes (insertions/deletions) without overwriting manual user edits.

4.3 Spec-to-Code
- The framework should define a workflow for generating code based on approved spec sections.`;

    const updatedContent = SfdtUtils.appendNote(doc.content, note);
    // appendNote wraps in [AI Note]: ..., let's strictly use it for now as "Add Functional Requirements" 
    
    await query('UPDATE documents SET content = $1 WHERE id = $2', [JSON.stringify(updatedContent), doc.id]);
    console.log("Added Functional Requirements section.");

  } catch (e) {
    console.error(e);
  }
}
main();
