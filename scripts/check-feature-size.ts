import postgres from "postgres";

const client = postgres("postgresql://Murphy:@localhost:5432/spec_docs");

/**
 * Repair script: Fix corrupted ai_metadata across features, bugs, and tasks.
 *
 * The previous double-serialization bug + partial repair left ai_metadata in two states:
 * 1. Character-indexed junk objects: {"0":"{","1":"\"","2":"0",...} (millions of keys)
 * 2. Oversized but structurally-correct objects (>50KB)
 *
 * Strategy:
 * - For features with a clean historical version, restore from that version
 * - For everything else, reset to '{}'::jsonb
 */

async function isCorrupted(row: { ai_metadata_len: number; has_numeric_key: boolean }) {
  return row.ai_metadata_len > 50000 || row.has_numeric_key;
}

async function main() {
  // --- STEP 1: Identify ALL corrupted rows ---
  // Corrupted = character-indexed junk (has key "0" with 1-char value) OR unreasonably large (>50KB)
  
  console.log("=== Identifying corrupted features ===");
  const corruptedFeatureIds = await client`
    SELECT DISTINCT id, title
    FROM current_features
    WHERE length(ai_metadata::text) > 50000
       OR (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2)
  `;
  console.log(`Found ${corruptedFeatureIds.length} corrupted feature IDs`);

  // --- STEP 2: For features with clean historical versions, find the best one ---
  const recoveryMap = new Map<string, string>(); // featureId -> best version_id

  for (const f of corruptedFeatureIds) {
    const best = await client`
      SELECT version_id, ai_metadata
      FROM features
      WHERE id = ${f.id}
        AND length(ai_metadata::text) > 4
        AND length(ai_metadata::text) < 50000
        AND NOT (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2)
      ORDER BY length(ai_metadata::text) DESC
      LIMIT 1
    `;
    if (best.length > 0) {
      recoveryMap.set(f.id, best[0].version_id);
      console.log(`  ${f.id} (${f.title}): will recover from version ${best[0].version_id}`);
    } else {
      console.log(`  ${f.id} (${f.title}): no clean version, will reset to {}`);
    }
  }

  // --- STEP 3: Fix features ---
  console.log("\n=== Fixing features ===");
  for (const f of corruptedFeatureIds) {
    const recoveryVersionId = recoveryMap.get(f.id);
    if (recoveryVersionId) {
      // Restore from best clean version
      const result = await client`
        UPDATE features
        SET ai_metadata = (
          SELECT ai_metadata FROM features WHERE version_id = ${recoveryVersionId}
        )
        WHERE id = ${f.id}
          AND (length(ai_metadata::text) > 50000
               OR (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2))
      `;
      console.log(`  Recovered ${f.id}: ${result.count} version(s) from ${recoveryVersionId}`);
    } else {
      // Reset to empty
      const result = await client`
        UPDATE features
        SET ai_metadata = '{}'::jsonb
        WHERE id = ${f.id}
          AND (length(ai_metadata::text) > 50000
               OR (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2))
      `;
      console.log(`  Reset ${f.id}: ${result.count} version(s) to {}`);
    }
  }

  // --- STEP 4: Fix bugs (no recovery, just reset) ---
  console.log("\n=== Fixing bugs ===");
  const bugResult = await client`
    UPDATE bugs
    SET ai_metadata = '{}'::jsonb
    WHERE length(ai_metadata::text) > 50000
       OR (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2)
  `;
  console.log(`  Reset ${bugResult.count} bug version(s) to {}`);

  // --- STEP 5: Fix tasks (no recovery, just reset) ---
  console.log("\n=== Fixing tasks ===");
  const taskResult = await client`
    UPDATE tasks
    SET ai_metadata = '{}'::jsonb
    WHERE length(ai_metadata::text) > 50000
       OR (ai_metadata ? '0' AND length(COALESCE(ai_metadata->>'0','')) <= 2)
  `;
  console.log(`  Reset ${taskResult.count} task version(s) to {}`);

  // --- STEP 6: Verify ---
  console.log("\n=== Verification ===");
  const verify = await client`
    SELECT id, title, length(ai_metadata::text) as len, jsonb_typeof(ai_metadata) as t
    FROM current_features
    WHERE id IN ('4ab5a8c9-7314-48dd-91fc-fdba9536aaaa', '9e21c0a7-f1a6-4d9f-8428-f583219a3827')
    LIMIT 4
  `;
  for (const v of verify) {
    console.log(`  ${v.id}: type=${v.t}, len=${v.len}`);
  }

  // Check no remaining large ai_metadata
  const remaining = await client`
    SELECT 'features' as tbl, count(*) as cnt FROM features WHERE length(ai_metadata::text) > 50000
    UNION ALL
    SELECT 'bugs', count(*) FROM bugs WHERE length(ai_metadata::text) > 50000
    UNION ALL
    SELECT 'tasks', count(*) FROM tasks WHERE length(ai_metadata::text) > 50000
  `;
  console.log("\nRemaining oversized ai_metadata:");
  for (const r of remaining) console.log(`  ${r.tbl}: ${r.cnt}`);

  console.log("\nDone!");
  await client.end();
}

main().catch(console.error);
