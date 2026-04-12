import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try to load from local .env first, then parent .env.local
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env.local') });

const connString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
const isLocalhost = connString?.includes('localhost') || connString?.includes('127.0.0.1');

const connectionConfig = connString
  ? {
      connectionString: connString,
      ...(isLocalhost ? {} : { ssl: { rejectUnauthorized: false } }),
    }
  : {
      user: process.env.DB_USER || 'postgres',
      host: process.env.DB_HOST || 'localhost',
      database: process.env.DB_NAME || 'spec_docs',
      password: process.env.DB_PASSWORD || 'password',
      port: parseInt(process.env.DB_PORT || '5432'),
    };

const pool = new Pool(connectionConfig);

export const query = (text: string, params?: any[]) => pool.query(text, params);

export const getClient = () => pool.connect();

// =============================================================================
// TYPES
// =============================================================================

export type CascadeStatus =
  | "draft"
  | "triage"
  | "backlog"
  | "spec_generation"
  | "implementation"
  | "testing"
  | "done"
  | "rejected";

export type Priority = "critical" | "high" | "medium" | "low";
export type FeatureType = "feature" | "sub_feature";
export type BugSeverity = "blocker" | "critical" | "major" | "minor" | "trivial";
export type TaskStatus = "todo" | "in_progress" | "done" | "blocked";
export type ItemType = "feature" | "bug" | "task";
export type LinkType = "specification" | "test_plan" | "design" | "reference";

// =============================================================================
// FEATURE HELPERS
// =============================================================================

export async function createFeature(params: {
  id: string;
  title: string;
  description?: string;
  featureType?: FeatureType;
  parentId?: string;
  status?: CascadeStatus;
  priority?: Priority;
  effortEstimate?: string;
  createdBy?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT insert_feature_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::uuid, $6::varchar, $7::varchar, $8::varchar, $9::uuid, $10::uuid, $11::jsonb, $12::jsonb, $13::timestamptz, $14::uuid) AS version_id`,
    [
      params.id,
      params.title,
      params.description ?? null,
      params.featureType ?? "feature",
      params.parentId ?? null,
      params.status ?? "draft",
      params.priority ?? "medium",
      params.effortEstimate ?? null,
      params.createdBy ?? null,
      params.assignedTo ?? null,
      JSON.stringify(params.tags ?? []),
      JSON.stringify(params.aiMetadata ?? {}),
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

export async function updateFeature(params: {
  id: string;
  title?: string;
  description?: string;
  featureType?: FeatureType;
  parentId?: string;
  status?: CascadeStatus;
  priority?: Priority;
  effortEstimate?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT update_feature_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::uuid, $6::varchar, $7::varchar, $8::varchar, $9::uuid, $10::jsonb, $11::jsonb, $12::timestamptz, $13::uuid) AS version_id`,
    [
      params.id,
      params.title ?? null,
      params.description ?? null,
      params.featureType ?? null,
      params.parentId ?? null,
      params.status ?? null,
      params.priority ?? null,
      params.effortEstimate ?? null,
      params.assignedTo ?? null,
      params.tags ? JSON.stringify(params.tags) : null,
      params.aiMetadata ? JSON.stringify(params.aiMetadata) : null,
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

export async function getFeatureById(id: string) {
  const result = await query(
    `SELECT id, version_id, title, description, feature_type, parent_id, status, priority,
            effort_estimate, created_by, assigned_to, tags, ai_metadata, valid_from, valid_to
     FROM current_features WHERE id = $1 ORDER BY valid_from DESC LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function getSubFeatures(parentId: string) {
  const result = await query(
    `SELECT DISTINCT ON (id) id, title, feature_type, status, priority, valid_from
     FROM current_features WHERE parent_id = $1 ORDER BY id, valid_from DESC`,
    [parentId]
  );
  return result.rows;
}

// =============================================================================
// BUG HELPERS
// =============================================================================

export async function createBug(params: {
  id: string;
  title: string;
  description?: string;
  severity?: BugSeverity;
  status?: CascadeStatus;
  priority?: Priority;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: Record<string, unknown>;
  createdBy?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT insert_bug_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::varchar, $7::text, $8::text, $9::text, $10::jsonb, $11::uuid, $12::uuid, $13::jsonb, $14::jsonb, $15::timestamptz, $16::uuid) AS version_id`,
    [
      params.id,
      params.title,
      params.description ?? null,
      params.severity ?? "major",
      params.status ?? "draft",
      params.priority ?? "medium",
      params.stepsToReproduce ?? null,
      params.expectedBehavior ?? null,
      params.actualBehavior ?? null,
      JSON.stringify(params.environment ?? {}),
      params.createdBy ?? null,
      params.assignedTo ?? null,
      JSON.stringify(params.tags ?? []),
      JSON.stringify(params.aiMetadata ?? {}),
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

export async function updateBug(params: {
  id: string;
  title?: string;
  description?: string;
  severity?: BugSeverity;
  status?: CascadeStatus;
  priority?: Priority;
  stepsToReproduce?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  environment?: Record<string, unknown>;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT update_bug_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::varchar, $7::text, $8::text, $9::text, $10::jsonb, $11::uuid, $12::jsonb, $13::jsonb, $14::timestamptz, $15::uuid) AS version_id`,
    [
      params.id,
      params.title ?? null,
      params.description ?? null,
      params.severity ?? null,
      params.status ?? null,
      params.priority ?? null,
      params.stepsToReproduce ?? null,
      params.expectedBehavior ?? null,
      params.actualBehavior ?? null,
      params.environment ? JSON.stringify(params.environment) : null,
      params.assignedTo ?? null,
      params.tags ? JSON.stringify(params.tags) : null,
      params.aiMetadata ? JSON.stringify(params.aiMetadata) : null,
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

export async function getBugById(id: string) {
  const result = await query(
    `SELECT id, version_id, title, description, severity, status, priority,
            steps_to_reproduce, expected_behavior, actual_behavior, environment,
            created_by, assigned_to, tags, ai_metadata, valid_from, valid_to
     FROM current_bugs WHERE id = $1 ORDER BY valid_from DESC LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

// =============================================================================
// TASK HELPERS
// =============================================================================

export async function listTasks(filters?: {
  parentType?: string;
  parentId?: string;
  status?: string;
}) {
  let sql = `SELECT DISTINCT ON (id) id, version_id, title, parent_type, parent_id, status, priority, valid_from
             FROM current_tasks WHERE 1=1`;
  const params: any[] = [];
  if (filters?.parentType) { params.push(filters.parentType); sql += ` AND parent_type = $${params.length}`; }
  if (filters?.parentId) { params.push(filters.parentId); sql += ` AND parent_id = $${params.length}`; }
  if (filters?.status) { params.push(filters.status); sql += ` AND status = $${params.length}`; }
  sql += ' ORDER BY id, valid_from DESC';
  const result = await query(sql, params);
  return result.rows;
}

export async function getTaskById(id: string) {
  const result = await query(
    `SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
            effort_estimate, assigned_to, tags, ai_metadata, valid_from, valid_to
     FROM current_tasks WHERE id = $1 ORDER BY valid_from DESC LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createTask(params: {
  id: string;
  title: string;
  description?: string;
  parentType: string;
  parentId: string;
  status?: TaskStatus;
  priority?: Priority;
  effortEstimate?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT insert_task_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::uuid, $6::varchar, $7::varchar, $8::varchar, $9::uuid, $10::jsonb, $11::jsonb, $12::timestamptz, $13::uuid) AS version_id`,
    [
      params.id,
      params.title,
      params.description ?? null,
      params.parentType,
      params.parentId,
      params.status ?? "todo",
      params.priority ?? "medium",
      params.effortEstimate ?? null,
      params.assignedTo ?? null,
      JSON.stringify(params.tags ?? []),
      JSON.stringify(params.aiMetadata ?? {}),
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

export async function updateTask(params: {
  id: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  effortEstimate?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT update_task_version($1::uuid, $2::varchar, $3::text, $4::varchar, $5::varchar, $6::varchar, $7::uuid, $8::jsonb, $9::jsonb, $10::timestamptz, $11::uuid) AS version_id`,
    [
      params.id,
      params.title ?? null,
      params.description ?? null,
      params.status ?? null,
      params.priority ?? null,
      params.effortEstimate ?? null,
      params.assignedTo ?? null,
      params.tags ? JSON.stringify(params.tags) : null,
      params.aiMetadata ? JSON.stringify(params.aiMetadata) : null,
      new Date().toISOString(), // p_valid_from
      params.maintainedBy ?? null,
    ]
  );
  return result.rows[0].version_id as string;
}

// =============================================================================
// BACKLOG HELPERS
// =============================================================================

export async function getBacklogItemByItemId(itemType: string, itemId: string) {
  const result = await query(
    `SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to
     FROM current_backlog_items WHERE item_type = $1 AND item_id = $2 AND valid_to = 'infinity'
     ORDER BY valid_from DESC LIMIT 1`,
    [itemType, itemId]
  );
  return result.rows[0] ?? null;
}

export async function promoteToBacklog(params: {
  id: string;
  itemType: string;
  itemId: string;
  rank?: number;
  sprintLabel?: string;
  notes?: string;
  maintainedBy?: string;
}): Promise<string> {
  // Guard: skip if already on the backlog
  const existing = await getBacklogItemByItemId(params.itemType, params.itemId);
  if (existing) {
    return existing.version_id as string;
  }

  // Calculate next rank if not provided
  let rank = params.rank;
  if (rank === undefined) {
    const maxResult = await query(
      `SELECT COALESCE(MAX(rank), 0) + 1 AS next_rank FROM (SELECT DISTINCT ON (id) id, rank FROM current_backlog_items WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) sub`
    );
    rank = maxResult.rows[0].next_rank as number;
  }
  const result = await query(
    `SELECT insert_backlog_item_version($1::uuid, $2::varchar, $3::uuid, $4::integer, $5::varchar, $6::text, $7::timestamptz, $8::uuid) AS version_id`,
    [params.id, params.itemType, params.itemId, rank, params.sprintLabel ?? null, params.notes ?? null, new Date().toISOString(), params.maintainedBy ?? null]
  );
  return result.rows[0].version_id as string;
}

export async function updateBacklogItem(params: {
  id: string;
  rank?: number;
  sprintLabel?: string;
  notes?: string;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT update_backlog_item_version($1::uuid, $2::integer, $3::varchar, $4::text, $5::timestamptz, $6::uuid) AS version_id`,
    [params.id, params.rank ?? null, params.sprintLabel ?? null, params.notes ?? null, new Date().toISOString(), params.maintainedBy ?? null]
  );
  return result.rows[0].version_id as string;
}

// =============================================================================
// DOCUMENT / LINK HELPERS
// =============================================================================

export async function listDocuments() {
  const result = await query(
    `SELECT DISTINCT ON (id) id, version_id, title, valid_from FROM current_documents ORDER BY id, valid_from DESC`
  );
  return result.rows;
}

export async function getDocumentById(id: string) {
  const result = await query(
    `SELECT * FROM current_documents WHERE id = $1 ORDER BY valid_from DESC LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createDocument(params: {
  id: string;
  title: string;
  content: string;
  maintainedBy?: string;
}): Promise<string> {
  const result = await query(
    `SELECT insert_document_version($1::uuid, $2::varchar, $3::text, $4::timestamptz, $5::uuid) AS version_id`,
    [params.id, params.title, params.content, new Date().toISOString(), params.maintainedBy ?? null]
  );
  return result.rows[0].version_id as string;
}

export async function unlinkDocument(linkId: string): Promise<void> {
  await query(`SELECT delete_item_document_link($1)`, [linkId]);
}

export async function getDocumentsForItem(itemType: string, itemId: string) {
  const result = await query(
    `SELECT DISTINCT ON (idl.id) idl.*, d.title AS document_title
     FROM current_item_document_links idl
     LEFT JOIN (SELECT DISTINCT ON (id) * FROM current_documents ORDER BY id, valid_from DESC) d ON idl.document_id = d.id
     WHERE idl.item_type = $1 AND idl.item_id = $2
     ORDER BY idl.id, idl.valid_from DESC`,
    [itemType, itemId]
  );
  return result.rows;
}

export async function getDocumentLinksWithTitles(itemType: string, itemId: string) {
  const result = await query(
    `SELECT DISTINCT ON (l.id) l.id, l.version_id, l.item_type, l.item_id, l.document_id, l.link_type,
            l.valid_from, l.valid_to, d.title AS document_title
     FROM current_item_document_links l
     JOIN (SELECT DISTINCT ON (id) * FROM current_documents ORDER BY id, valid_from DESC) d ON l.document_id = d.id
     WHERE l.item_type = $1 AND l.item_id = $2
     ORDER BY l.id, l.valid_from DESC`,
    [itemType, itemId]
  );
  return result.rows;
}

// =============================================================================
// WORKFLOW / DASHBOARD HELPERS
// =============================================================================

export async function getWorkflowStatus() {
  const [features, bugs, tasks, backlog] = await Promise.all([
    query(`SELECT status, COUNT(*)::int AS count FROM (SELECT DISTINCT ON (id) id, status FROM current_features WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) f GROUP BY status ORDER BY status`),
    query(`SELECT status, COUNT(*)::int AS count FROM (SELECT DISTINCT ON (id) id, status FROM current_bugs WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) b GROUP BY status ORDER BY status`),
    query(`SELECT status, COUNT(*)::int AS count FROM (SELECT DISTINCT ON (id) id, status FROM current_tasks WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) t GROUP BY status ORDER BY status`),
    query(`SELECT item_type, COUNT(*)::int AS count FROM (SELECT DISTINCT ON (id) id, item_type FROM current_backlog_items WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) bi GROUP BY item_type`),
  ]);
  return {
    features: features.rows,
    bugs: bugs.rows,
    tasks: tasks.rows,
    backlog: backlog.rows,
  };
}
