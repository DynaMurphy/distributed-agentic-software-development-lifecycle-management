#!/usr/bin/env node
// scripts/push-vision-subdocs.mjs
// Run from mcp-server/ directory: cd mcp-server && node --input-type=module < ../scripts/push-vision-subdocs.mjs

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const { Client } = pg;
const client = new Client({ connectionString: 'postgresql://Murphy:@localhost:5432/spec_docs' });
await client.connect();

const MAINTAINED_BY = 'e5fc2085-e47c-42fa-bdae-f49e518ce1bf';
const MAIN_DOC_ID   = '905bd31a-0cd3-4c80-a400-914b31d5cf5c';
const NOW           = new Date().toISOString();

const subDocs = [
  {
    id:    '10000001-0000-4000-8000-000000000001',
    title: 'Vision: ASDLMS Architecture — Platform Registry & The Harness',
    file:  'docs/vision/01-architecture-platform-registry.md',
  },
  {
    id:    '10000002-0000-4000-8000-000000000002',
    title: 'Vision: ASDLMS Architecture — SPLM Control Plane',
    file:  'docs/vision/02-architecture-splm-control-plane.md',
  },
  {
    id:    '10000003-0000-4000-8000-000000000003',
    title: 'Vision: ASDLMS Workflows',
    file:  'docs/vision/03-workflows.md',
  },
  {
    id:    '10000004-0000-4000-8000-000000000004',
    title: 'Vision: ASDLMS Governance, Roles & Security',
    file:  'docs/vision/04-governance-security.md',
  },
  {
    id:    '10000005-0000-4000-8000-000000000005',
    title: 'Vision: The Agentic Flywheel — Feedback & Self-Improvement',
    file:  'docs/vision/05-agentic-flywheel.md',
  },
  {
    id:    '10000006-0000-4000-8000-000000000006',
    title: 'Vision: Best Practices, Anti-Patterns & Getting Started',
    file:  'docs/vision/06-practices-getting-started.md',
  },
];

// --- Update main TOC document ---
const mainContent = fs.readFileSync(path.join(ROOT, 'VISION.md'), 'utf8');
await client.query(
  `SELECT update_document_version($1, $2, $3, $4, $5)`,
  [MAIN_DOC_ID, 'Vision: Agentic Spec-Driven SDLM System', mainContent, null, MAINTAINED_BY]
);
console.log(`✅ Updated main doc (${MAIN_DOC_ID}) — ${mainContent.length} chars`);

// --- Insert sub-documents ---
for (const doc of subDocs) {
  const rawContent = fs.readFileSync(path.join(ROOT, doc.file), 'utf8');
  // Strip the H1 title line (first line) so the SPLM editor doesn't duplicate it
  const content = rawContent.replace(/^# .+\n/, '');

  await client.query(
    `SELECT insert_document_version($1::uuid, $2::varchar, $3::text, $4::timestamptz, $5::uuid)`,
    [doc.id, doc.title, content, NOW, MAINTAINED_BY]
  );
  console.log(`✅ Inserted ${doc.title} (${doc.id}) — ${content.length} chars`);
}

await client.end();
console.log('\n✅ All done. Refresh the SPLM sidebar to see the new documents.');
