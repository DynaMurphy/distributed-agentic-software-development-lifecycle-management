import { query } from './build/db.js';
import { SfdtUtils } from './build/sfdt-utils.js';

const specTitle = "Spec-Driven Development Framework";
const specText = `
1. Introduction
This project aims to create a framework where AI agents and users collaborate to build software based on a living specification document.

2. Core Workflow
- Spec Creation: User and AI draft a spec.
- Implementation: AI generates code to match the spec.
- Verification: AI analyzes code against spec (using this framework).

3. Architecture
- Next.js Frontend with Syncfusion Document Editor for spec management.
- PostgreSQL Database for storing specs and project metadata.
- MCP Server for AI agents to ready/write specs.

4. Next Steps
- Implement AI-driven Spec Analysis.
- Connect implementation tools.
`;

async function main() {
  try {
    const newContent = SfdtUtils.createFromText(specTitle, specText);
    const contentString = JSON.stringify(newContent);

    // Check if there's an existing document
    const check = await query('SELECT id FROM current_documents ORDER BY valid_from DESC LIMIT 1');
    
    if (check.rows.length > 0) {
      const id = check.rows[0].id;
      await query('SELECT update_document_version($1, $2, $3)', [id, specTitle, contentString]);
      console.log(`Updated document ${id} with new spec.`);
    } else {
      const newId = crypto.randomUUID();
      await query('SELECT insert_document_version($1, $2, $3)', [newId, specTitle, contentString]);
      console.log("Created new spec document.");
    }

  } catch (e) {
    console.error("Error updating spec:", e);
    process.exit(1);
  }
  process.exit(0);
}

main();
