import { query } from './build/db.js';
import { SfdtUtils } from './build/sfdt-utils.js';

async function main() {
  try {
    // console.log("Querying database...");
    const result = await query('SELECT * FROM current_documents ORDER BY valid_from DESC LIMIT 1');
    if (result.rows.length === 0) {
      console.log("No documents found.");
    } else {
      console.log(`Document Found: "${result.rows[0].title}"\n`);
      console.log(SfdtUtils.sfdtToMarkdown(result.rows[0].content));
    }
  } catch (e) {
    console.error("Error accessing content:", e);
    process.exit(1);
  }
  process.exit(0);
}

main();
