import "server-only";

import postgres from "postgres";
import { ChatSDKError } from "../errors";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);

/**
 * Safely serialize a value for JSONB storage.
 * Handles the case where the value is already a JSON string
 * (e.g. from a prior double-serialization bug) to prevent
 * exponential growth of escaped quotes.
 */
function toJsonbString(value: unknown, fallback = "{}"): string {
  if (value == null) return fallback;
  if (typeof value === "string") {
    // Already a string — check if it's valid JSON
    try {
      JSON.parse(value);
      return value; // It's a valid JSON string, use it directly
    } catch {
      return fallback;
    }
  }
  return JSON.stringify(value);
}

// =============================================================================
// TYPES
// =============================================================================

/** Cascade status shared by features and bugs */
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
export type RepositoryStatus = "active" | "archived";
export type CapabilityStatus = "active" | "archived";
export type RoadmapHorizon = "now" | "next" | "later";
export type SdlcPhase =
  | "strategy_planning"
  | "prioritization"
  | "specification"
  | "implementation"
  | "verification"
  | "delivery"
  | "post_delivery"
  | "platform";

/** Well-known UUID for the default / local repository */
export const DEFAULT_REPOSITORY_ID = "00000000-0000-0000-0000-000000000001";

// --- Repository ---
export interface BitemporalRepository {
  id: string;
  version_id: string;
  name: string;
  full_name: string | null;
  description: string | null;
  github_url: string | null;
  default_branch: string;
  status: RepositoryStatus;
  settings: Record<string, unknown>;
  maintained_by: string | null;
  valid_from: Date;
  valid_to: Date;
}

export interface BitemporalRepositorySummary {
  id: string;
  version_id: string;
  name: string;
  full_name: string | null;
  status: RepositoryStatus;
  valid_from: Date;
}

// --- Feature ---
export interface BitemporalFeature {
  id: string;
  version_id: string;
  title: string;
  description: string | null;
  feature_type: FeatureType;
  parent_id: string | null;
  status: CascadeStatus;
  priority: Priority;
  effort_estimate: string | null;
  created_by: string | null;
  assigned_to: string | null;
  tags: string[];
  ai_metadata: Record<string, unknown>;
  maintained_by: string | null;
  maintained_by_email: string | null;
  repository_id: string;
  planned_start: string | null;
  planned_end: string | null;
  roadmap_horizon: RoadmapHorizon | null;
  valid_from: Date;
  valid_to: Date;
}

export interface BitemporalFeatureSummary {
  id: string;
  version_id: string;
  title: string;
  feature_type: FeatureType;
  status: CascadeStatus;
  priority: Priority;
  repository_id: string;
  planned_start: string | null;
  planned_end: string | null;
  roadmap_horizon: RoadmapHorizon | null;
  valid_from: Date;
}

// --- Bug ---
export interface BitemporalBug {
  id: string;
  version_id: string;
  title: string;
  description: string | null;
  severity: BugSeverity;
  status: CascadeStatus;
  priority: Priority;
  steps_to_reproduce: string | null;
  expected_behavior: string | null;
  actual_behavior: string | null;
  environment: Record<string, unknown>;
  created_by: string | null;
  assigned_to: string | null;
  tags: string[];
  ai_metadata: Record<string, unknown>;
  maintained_by: string | null;
  maintained_by_email: string | null;
  repository_id: string;
  valid_from: Date;
  valid_to: Date;
}

export interface BitemporalBugSummary {
  id: string;
  version_id: string;
  title: string;
  severity: BugSeverity;
  status: CascadeStatus;
  priority: Priority;
  repository_id: string;
  valid_from: Date;
}

// --- Task ---
export interface BitemporalTask {
  id: string;
  version_id: string;
  title: string;
  description: string | null;
  parent_type: "feature" | "bug";
  parent_id: string;
  status: TaskStatus;
  priority: Priority;
  effort_estimate: string | null;
  assigned_to: string | null;
  tags: string[];
  ai_metadata: Record<string, unknown>;
  maintained_by: string | null;
  repository_id: string;
  valid_from: Date;
  valid_to: Date;
}

export interface BitemporalTaskSummary {
  id: string;
  version_id: string;
  title: string;
  parent_type: "feature" | "bug";
  parent_id: string;
  status: TaskStatus;
  priority: Priority;
  repository_id: string;
  valid_from: Date;
}

// --- Backlog Item ---
export interface BitemporalBacklogItem {
  id: string;
  version_id: string;
  item_type: "feature" | "bug";
  item_id: string;
  rank: number;
  sprint_label: string | null;
  notes: string | null;
  maintained_by: string | null;
  repository_id: string;
  valid_from: Date;
  valid_to: Date;
}

/** Backlog item enriched with the referenced feature/bug title and status */
export interface BacklogItemWithDetails extends BitemporalBacklogItem {
  item_title: string;
  item_status: CascadeStatus;
  item_priority: Priority;
  item_description?: string | null;
  ai_metadata?: Record<string, any> | null;
  task_total: number;
  task_done: number;
}

// --- Item-Document Link ---
export interface BitemporalItemDocumentLink {
  id: string;
  version_id: string;
  item_type: ItemType;
  item_id: string;
  document_id: string;
  link_type: LinkType;
  maintained_by: string | null;
  repository_id: string;
  valid_from: Date;
  valid_to: Date;
}

// =============================================================================
// REPOSITORY QUERIES
// =============================================================================

export async function listRepositories(filters?: {
  status?: RepositoryStatus;
}): Promise<BitemporalRepositorySummary[]> {
  try {
    let query = `
      SELECT DISTINCT ON (id) id, version_id, name, full_name, status, valid_from
      FROM current_repositories
    `;
    const conditions: string[] = [];
    if (filters?.status) conditions.push(`status = '${filters.status}'`);
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY id, valid_from DESC";
    const rows = await client.unsafe(query);
    return rows as unknown as BitemporalRepositorySummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list repositories");
  }
}

export async function getRepositoryById(id: string): Promise<BitemporalRepository | null> {
  try {
    const rows = await client`
      SELECT id, version_id, name, full_name, description, github_url, default_branch,
             status, settings, maintained_by, valid_from, valid_to
      FROM current_repositories
      WHERE id = ${id}
      ORDER BY valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalRepository;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get repository by id");
  }
}

export async function createRepository(params: {
  id: string;
  name: string;
  fullName?: string;
  description?: string;
  githubUrl?: string;
  defaultBranch?: string;
  status?: RepositoryStatus;
  settings?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_repository_version(
        ${params.id}::uuid,
        ${params.name}::varchar,
        ${params.fullName ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.githubUrl ?? null}::varchar,
        ${params.defaultBranch ?? "main"}::varchar,
        ${params.status ?? "active"}::varchar,
        ${JSON.stringify(params.settings ?? {})}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create repository");
  }
}

export async function updateRepository(params: {
  id: string;
  name?: string;
  fullName?: string;
  description?: string;
  githubUrl?: string;
  defaultBranch?: string;
  status?: RepositoryStatus;
  settings?: Record<string, unknown>;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT update_repository_version(
        ${params.id}::uuid,
        ${params.name ?? null}::varchar,
        ${params.fullName ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.githubUrl ?? null}::varchar,
        ${params.defaultBranch ?? null}::varchar,
        ${params.status ?? null}::varchar,
        ${params.settings ? JSON.stringify(params.settings) : null}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update repository");
  }
}

// =============================================================================
// FEATURE QUERIES
// =============================================================================

export async function listFeatures(filters?: {
  status?: CascadeStatus;
  priority?: Priority;
  featureType?: FeatureType;
  parentId?: string;
  repositoryId?: string;
}): Promise<BitemporalFeatureSummary[]> {
  try {
    let query = `
      SELECT DISTINCT ON (id) id, version_id, title, feature_type, status, priority, repository_id, valid_from
      FROM current_features
    `;
    const conditions: string[] = [];
    if (filters?.status) conditions.push(`status = '${filters.status}'`);
    if (filters?.priority) conditions.push(`priority = '${filters.priority}'`);
    if (filters?.featureType) conditions.push(`feature_type = '${filters.featureType}'`);
    if (filters?.parentId) conditions.push(`parent_id = '${filters.parentId}'`);
    if (filters?.repositoryId) conditions.push(`repository_id = '${filters.repositoryId}'`);

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY id, valid_from DESC";

    const rows = await client.unsafe(query);
    return rows as unknown as BitemporalFeatureSummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list features");
  }
}

// =============================================================================
// ROADMAP QUERIES
// =============================================================================

export interface RoadmapItem {
  id: string;
  version_id: string;
  title: string;
  feature_type: FeatureType;
  status: CascadeStatus;
  priority: Priority;
  effort_estimate: string | null;
  planned_start: string | null;
  planned_end: string | null;
  roadmap_horizon: RoadmapHorizon | null;
  parent_id: string | null;
  capability_name: string | null;
  capability_id: string | null;
  task_total: number;
  task_done: number;
  repository_id: string;
}

export async function getRoadmapItems(filters?: {
  capabilityId?: string;
  priority?: Priority;
  status?: CascadeStatus;
  horizon?: RoadmapHorizon;
  repositoryId?: string;
}): Promise<RoadmapItem[]> {
  try {
    let query = `
      SELECT DISTINCT ON (f.id)
        f.id, f.version_id, f.title, f.feature_type, f.status, f.priority,
        f.effort_estimate, f.planned_start, f.planned_end, f.roadmap_horizon,
        f.parent_id, f.repository_id,
        c.name AS capability_name,
        c.id AS capability_id,
        (SELECT COUNT(*)::int FROM current_tasks t WHERE t.parent_id = f.id AND t.valid_to = 'infinity') AS task_total,
        (SELECT COUNT(*)::int FROM current_tasks t WHERE t.parent_id = f.id AND t.valid_to = 'infinity' AND t.status = 'done') AS task_done
      FROM current_features f
      LEFT JOIN current_capability_items ci ON ci.item_id = f.id AND ci.item_type = 'feature' AND ci.valid_to = 'infinity'
      LEFT JOIN current_capabilities c ON c.id = ci.capability_id AND c.valid_to = 'infinity'
      WHERE f.valid_to = 'infinity'
        AND f.feature_type = 'feature'
        AND f.status NOT IN ('rejected')
    `;
    const conditions: string[] = [];
    if (filters?.capabilityId) conditions.push(`c.id = '${filters.capabilityId}'`);
    if (filters?.priority) conditions.push(`f.priority = '${filters.priority}'`);
    if (filters?.status) conditions.push(`f.status = '${filters.status}'`);
    if (filters?.horizon) conditions.push(`f.roadmap_horizon = '${filters.horizon}'`);
    if (filters?.repositoryId) conditions.push(`f.repository_id = '${filters.repositoryId}'`);

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY f.id, f.valid_from DESC";

    const rows = await client.unsafe(query);
    return rows as unknown as RoadmapItem[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get roadmap items");
  }
}

export async function updateRoadmapSchedule(params: {
  id: string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  maintainedBy?: string;
}): Promise<string> {
  return updateFeature({
    id: params.id,
    plannedStart: params.plannedStart,
    plannedEnd: params.plannedEnd,
    maintainedBy: params.maintainedBy,
  });
}

export async function updateRoadmapHorizon(params: {
  id: string;
  roadmapHorizon: RoadmapHorizon;
  maintainedBy?: string;
}): Promise<string> {
  return updateFeature({
    id: params.id,
    roadmapHorizon: params.roadmapHorizon,
    maintainedBy: params.maintainedBy,
  });
}

export async function getFeatureById(id: string): Promise<BitemporalFeature | null> {
  try {
    const rows = await client`
      SELECT f.id, f.version_id, f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
             f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata, f.maintained_by,
             u.email AS maintained_by_email, f.valid_from, f.valid_to
      FROM current_features f
      LEFT JOIN "User" u ON f.maintained_by = u.id
      WHERE f.id = ${id}
      ORDER BY f.valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalFeature;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get feature by id");
  }
}

export async function getFeatureVersions(id: string): Promise<BitemporalFeature[]> {
  try {
    const rows = await client`
      SELECT f.id, f.version_id, f.title, f.description, f.feature_type, f.parent_id, f.status, f.priority,
             f.effort_estimate, f.created_by, f.assigned_to, f.tags, f.ai_metadata, f.maintained_by,
             u.email AS maintained_by_email, f.valid_from, f.valid_to
      FROM features f
      LEFT JOIN "User" u ON f.maintained_by = u.id
      WHERE f.id = ${id}
      ORDER BY f.valid_from ASC
    `;
    return rows as unknown as BitemporalFeature[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get feature versions");
  }
}

/**
 * Restore a previous version of a feature by creating a new version
 * with the same field values. Previous versions are retained with their
 * bitemporal periods — nothing is deleted.
 */
export async function restoreFeatureVersion(featureId: string, versionId: string): Promise<string> {
  try {
    // Fetch the version to restore
    const rows = await client`
      SELECT id, title, description, feature_type, parent_id, status, priority,
             effort_estimate, assigned_to, tags, ai_metadata
      FROM features
      WHERE id = ${featureId} AND version_id = ${versionId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new ChatSDKError("not_found:feature", "Version not found");
    }
    const v = rows[0];
    // Create a new current version using update_feature_version
    const result = await client`
      SELECT update_feature_version(
        ${featureId}::uuid,
        ${v.title}::varchar,
        ${v.description}::text,
        ${v.feature_type}::varchar,
        ${v.parent_id}::uuid,
        ${v.status}::varchar,
        ${v.priority}::varchar,
        ${v.effort_estimate}::varchar,
        ${v.assigned_to}::uuid,
        ${toJsonbString(v.tags, "[]")}::jsonb,
        ${toJsonbString(v.ai_metadata)}::jsonb,
        ${new Date()}::timestamptz,
        ${null}::uuid
      ) AS version_id
    `;
    return result[0].version_id as string;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError("bad_request:database", "Failed to restore feature version");
  }
}

export async function getSubFeatures(parentId: string): Promise<BitemporalFeatureSummary[]> {
  try {
    const rows = await client`
      SELECT DISTINCT ON (id) id, version_id, title, feature_type, status, priority, valid_from
      FROM current_features
      WHERE parent_id = ${parentId}
      ORDER BY id, valid_from DESC
    `;
    return rows as unknown as BitemporalFeatureSummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get sub-features");
  }
}

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
  repositoryId?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_feature_version(
        ${params.id}::uuid,
        ${params.title}::varchar,
        ${params.description ?? null}::text,
        ${params.featureType ?? "feature"}::varchar,
        ${params.parentId ?? null}::uuid,
        ${params.status ?? "draft"}::varchar,
        ${params.priority ?? "medium"}::varchar,
        ${params.effortEstimate ?? null}::varchar,
        ${params.createdBy ?? null}::uuid,
        ${params.assignedTo ?? null}::uuid,
        ${toJsonbString(params.tags, "[]")}::jsonb,
        ${toJsonbString(params.aiMetadata)}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    const versionId = rows[0].version_id as string;
    if (params.repositoryId) {
      await client`UPDATE features SET repository_id = ${params.repositoryId}::uuid WHERE version_id = ${versionId}::uuid`;
    }
    return versionId;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create feature");
  }
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
  plannedStart?: string | null;
  plannedEnd?: string | null;
  roadmapHorizon?: RoadmapHorizon | null;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT update_feature_version(
        ${params.id}::uuid,
        ${params.title ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.featureType ?? null}::varchar,
        ${params.parentId ?? null}::uuid,
        ${params.status ?? null}::varchar,
        ${params.priority ?? null}::varchar,
        ${params.effortEstimate ?? null}::varchar,
        ${params.assignedTo ?? null}::uuid,
        ${params.tags ? toJsonbString(params.tags, "[]") : null}::jsonb,
        ${params.aiMetadata ? toJsonbString(params.aiMetadata) : null}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid,
        ${null}::uuid,
        ${params.plannedStart ?? null}::timestamptz,
        ${params.plannedEnd ?? null}::timestamptz,
        ${params.roadmapHorizon ?? null}::varchar
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update feature");
  }
}

// =============================================================================
// BUG QUERIES
// =============================================================================

export async function listBugs(filters?: {
  status?: CascadeStatus;
  priority?: Priority;
  severity?: BugSeverity;
  repositoryId?: string;
}): Promise<BitemporalBugSummary[]> {
  try {
    let query = `
      SELECT DISTINCT ON (id) id, version_id, title, severity, status, priority, repository_id, valid_from
      FROM current_bugs
    `;
    const conditions: string[] = [];
    if (filters?.status) conditions.push(`status = '${filters.status}'`);
    if (filters?.priority) conditions.push(`priority = '${filters.priority}'`);
    if (filters?.severity) conditions.push(`severity = '${filters.severity}'`);
    if (filters?.repositoryId) conditions.push(`repository_id = '${filters.repositoryId}'`);

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY id, valid_from DESC";

    const rows = await client.unsafe(query);
    return rows as unknown as BitemporalBugSummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list bugs");
  }
}

export async function getBugById(id: string): Promise<BitemporalBug | null> {
  try {
    const rows = await client`
      SELECT b.id, b.version_id, b.title, b.description, b.severity, b.status, b.priority,
             b.steps_to_reproduce, b.expected_behavior, b.actual_behavior, b.environment,
             b.created_by, b.assigned_to, b.tags, b.ai_metadata, b.maintained_by,
             u.email AS maintained_by_email, b.valid_from, b.valid_to
      FROM current_bugs b
      LEFT JOIN "User" u ON b.maintained_by = u.id
      WHERE b.id = ${id}
      ORDER BY b.valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalBug;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get bug by id");
  }
}

export async function getBugVersions(id: string): Promise<BitemporalBug[]> {
  try {
    const rows = await client`
      SELECT b.id, b.version_id, b.title, b.description, b.severity, b.status, b.priority,
             b.steps_to_reproduce, b.expected_behavior, b.actual_behavior, b.environment,
             b.created_by, b.assigned_to, b.tags, b.ai_metadata, b.maintained_by,
             u.email AS maintained_by_email, b.valid_from, b.valid_to
      FROM bugs b
      LEFT JOIN "User" u ON b.maintained_by = u.id
      WHERE b.id = ${id}
      ORDER BY b.valid_from ASC
    `;
    return rows as unknown as BitemporalBug[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get bug versions");
  }
}

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
  repositoryId?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_bug_version(
        ${params.id}::uuid,
        ${params.title}::varchar,
        ${params.description ?? null}::text,
        ${params.severity ?? "major"}::varchar,
        ${params.status ?? "draft"}::varchar,
        ${params.priority ?? "medium"}::varchar,
        ${params.stepsToReproduce ?? null}::text,
        ${params.expectedBehavior ?? null}::text,
        ${params.actualBehavior ?? null}::text,
        ${JSON.stringify(params.environment ?? {})}::jsonb,
        ${params.createdBy ?? null}::uuid,
        ${params.assignedTo ?? null}::uuid,
        ${toJsonbString(params.tags, "[]")}::jsonb,
        ${toJsonbString(params.aiMetadata)}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    const versionId = rows[0].version_id as string;
    if (params.repositoryId) {
      await client`UPDATE bugs SET repository_id = ${params.repositoryId}::uuid WHERE version_id = ${versionId}::uuid`;
    }
    return versionId;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create bug");
  }
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
  try {
    const rows = await client`
      SELECT update_bug_version(
        ${params.id}::uuid,
        ${params.title ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.severity ?? null}::varchar,
        ${params.status ?? null}::varchar,
        ${params.priority ?? null}::varchar,
        ${params.stepsToReproduce ?? null}::text,
        ${params.expectedBehavior ?? null}::text,
        ${params.actualBehavior ?? null}::text,
        ${params.environment ? JSON.stringify(params.environment) : null}::jsonb,
        ${params.assignedTo ?? null}::uuid,
        ${params.tags ? toJsonbString(params.tags, "[]") : null}::jsonb,
        ${params.aiMetadata ? toJsonbString(params.aiMetadata) : null}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update bug");
  }
}

export async function restoreBugVersion(bugId: string, versionId: string): Promise<string> {
  try {
    // Fetch the version to restore
    const rows = await client`
      SELECT id, title, description, severity, status, priority,
             steps_to_reproduce, expected_behavior, actual_behavior, environment,
             assigned_to, tags, ai_metadata
      FROM bugs
      WHERE id = ${bugId} AND version_id = ${versionId}
      LIMIT 1
    `;
    if (rows.length === 0) {
      throw new ChatSDKError("not_found:bug", "Version not found");
    }
    const v = rows[0];
    // Create a new current version using update_bug_version
    const result = await client`
      SELECT update_bug_version(
        ${bugId}::uuid,
        ${v.title}::varchar,
        ${v.description}::text,
        ${v.severity}::varchar,
        ${v.status}::varchar,
        ${v.priority}::varchar,
        ${v.steps_to_reproduce}::text,
        ${v.expected_behavior}::text,
        ${v.actual_behavior}::text,
        ${v.environment ? JSON.stringify(v.environment) : '{}'}::jsonb,
        ${v.assigned_to}::uuid,
        ${toJsonbString(v.tags, "[]")}::jsonb,
        ${toJsonbString(v.ai_metadata)}::jsonb,
        ${new Date()}::timestamptz,
        ${null}::uuid
      ) AS version_id
    `;
    return result[0].version_id as string;
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError("bad_request:database", "Failed to restore bug version");
  }
}

// =============================================================================
// TASK QUERIES
// =============================================================================

export async function listTasks(filters?: {
  parentType?: "feature" | "bug";
  parentId?: string;
  status?: TaskStatus;
  repositoryId?: string;
}): Promise<BitemporalTaskSummary[]> {
  try {
    let query = `
      SELECT DISTINCT ON (id) id, version_id, title, parent_type, parent_id, status, priority, repository_id, valid_from
      FROM current_tasks
    `;
    const conditions: string[] = [];
    if (filters?.parentType) conditions.push(`parent_type = '${filters.parentType}'`);
    if (filters?.parentId) conditions.push(`parent_id = '${filters.parentId}'`);
    if (filters?.status) conditions.push(`status = '${filters.status}'`);
    if (filters?.repositoryId) conditions.push(`repository_id = '${filters.repositoryId}'`);

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY id, valid_from DESC";

    const rows = await client.unsafe(query);
    return rows as unknown as BitemporalTaskSummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list tasks");
  }
}

export async function getTaskById(id: string): Promise<BitemporalTask | null> {
  try {
    const rows = await client`
      SELECT id, version_id, title, description, parent_type, parent_id, status, priority,
             effort_estimate, assigned_to, tags, ai_metadata, valid_from, valid_to
      FROM current_tasks
      WHERE id = ${id}
      ORDER BY valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalTask;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get task by id");
  }
}

export async function createTask(params: {
  id: string;
  title: string;
  description?: string;
  parentType: "feature" | "bug";
  parentId: string;
  status?: TaskStatus;
  priority?: Priority;
  effortEstimate?: string;
  assignedTo?: string;
  tags?: string[];
  aiMetadata?: Record<string, unknown>;
  maintainedBy?: string;
  repositoryId?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_task_version(
        ${params.id}::uuid,
        ${params.title}::varchar,
        ${params.description ?? null}::text,
        ${params.parentType}::varchar,
        ${params.parentId}::uuid,
        ${params.status ?? "todo"}::varchar,
        ${params.priority ?? "medium"}::varchar,
        ${params.effortEstimate ?? null}::varchar,
        ${params.assignedTo ?? null}::uuid,
        ${toJsonbString(params.tags, "[]")}::jsonb,
        ${toJsonbString(params.aiMetadata)}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    const versionId = rows[0].version_id as string;
    if (params.repositoryId) {
      await client`UPDATE tasks SET repository_id = ${params.repositoryId}::uuid WHERE version_id = ${versionId}::uuid`;
    }
    return versionId;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create task");
  }
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
  try {
    const rows = await client`
      SELECT update_task_version(
        ${params.id}::uuid,
        ${params.title ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.status ?? null}::varchar,
        ${params.priority ?? null}::varchar,
        ${params.effortEstimate ?? null}::varchar,
        ${params.assignedTo ?? null}::uuid,
        ${params.tags ? toJsonbString(params.tags, "[]") : null}::jsonb,
        ${params.aiMetadata ? toJsonbString(params.aiMetadata) : null}::jsonb,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update task");
  }
}

// =============================================================================
// BACKLOG QUERIES
// =============================================================================

export async function getBacklog(filters?: {
  sprintLabel?: string;
  itemType?: "feature" | "bug";
  repositoryId?: string;
}): Promise<BacklogItemWithDetails[]> {
  try {
    let query = `
      SELECT DISTINCT ON (bi.id)
        bi.id, bi.version_id, bi.item_type, bi.item_id, bi.rank,
        bi.sprint_label, bi.notes, bi.valid_from, bi.valid_to,
        COALESCE(f.title, b.title) AS item_title,
        COALESCE(f.status, b.status) AS item_status,
        COALESCE(f.priority, b.priority) AS item_priority,
        LEFT(COALESCE(f.description, b.description), 200) AS item_description,
        (SELECT jsonb_strip_nulls(jsonb_build_object(
          'triage', CASE WHEN _m ? 'triage' THEN jsonb_build_object(
            'suggestedPriority', _m->'triage'->'suggestedPriority',
            'suggestedEffort', _m->'triage'->'suggestedEffort',
            'riskLevel', _m->'triage'->'riskLevel'
          ) END,
          'duplicateCheck', CASE WHEN _m ? 'duplicateCheck' THEN jsonb_build_object(
            'candidateCount', jsonb_array_length(COALESCE(_m->'duplicateCheck'->'candidates', '[]'::jsonb))
          ) END,
          'suggestedLinks', CASE WHEN _m ? 'suggestedLinks' THEN jsonb_build_object(
            'suggestionCount', jsonb_array_length(COALESCE(_m->'suggestedLinks'->'suggestions', '[]'::jsonb))
          ) END,
          'specGeneration', CASE WHEN _m ? 'specGeneration' THEN jsonb_build_object(
            'specTitle', _m->'specGeneration'->'specTitle'
          ) END,
          'impactAnalysis', CASE WHEN _m ? 'impactAnalysis' THEN jsonb_build_object(
            'overallRisk', _m->'impactAnalysis'->'overallRisk'
          ) END,
          'implementationPlan', CASE WHEN _m ? 'implementationPlan' THEN jsonb_build_object(
            'taskCount', jsonb_array_length(COALESCE(_m->'implementationPlan'->'tasks', '[]'::jsonb))
          ) END,
          'testPlan', CASE WHEN _m ? 'testPlan' THEN jsonb_build_object(
            'scenarioCount', jsonb_array_length(COALESCE(_m->'testPlan'->'scenarios', '[]'::jsonb))
          ) END,
          'signoff', CASE WHEN _m ? 'signoff' THEN jsonb_build_object(
            'verdict', _m->'signoff'->'verdict'
          ) END,
          'designPhase', CASE WHEN _m ? 'designPhase' THEN jsonb_build_object(
            'duplicatesFound', _m->'designPhase'->'duplicatesFound',
            'linksAccepted', _m->'designPhase'->'linksAccepted',
            'specGenerated', _m->'designPhase'->'specGenerated'
          ) END
        )) FROM (SELECT COALESCE(f.ai_metadata, b.ai_metadata, '{}'::jsonb) AS _m) _sub
        ) AS ai_metadata
      , (SELECT COUNT(*)::int FROM current_tasks t WHERE t.parent_id = bi.item_id AND t.valid_to = 'infinity') AS task_total
      , (SELECT COUNT(*)::int FROM current_tasks t WHERE t.parent_id = bi.item_id AND t.valid_to = 'infinity' AND t.status = 'done') AS task_done
      FROM current_backlog_items bi
      LEFT JOIN current_features f ON bi.item_type = 'feature' AND bi.item_id = f.id AND f.valid_to = 'infinity'
      LEFT JOIN current_bugs b ON bi.item_type = 'bug' AND bi.item_id = b.id AND b.valid_to = 'infinity'
      WHERE bi.valid_to = 'infinity'
        AND COALESCE(f.status, b.status) != 'rejected'
    `;
    const conditions: string[] = [];
    if (filters?.sprintLabel) conditions.push(`bi.sprint_label = '${filters.sprintLabel}'`);
    if (filters?.itemType) conditions.push(`bi.item_type = '${filters.itemType}'`);
    if (filters?.repositoryId) conditions.push(`bi.repository_id = '${filters.repositoryId}'`);

    if (conditions.length > 0) {
      query += ` AND ${conditions.join(" AND ")}`;
    }
    query += " ORDER BY bi.id, bi.valid_from DESC";

    // Re-sort by rank after dedup
    query = `SELECT * FROM (${query}) sub ORDER BY sub.rank ASC, sub.valid_from DESC`;

    const rows = await client.unsafe(query);
    return rows as unknown as BacklogItemWithDetails[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get backlog");
  }
}

export async function getBacklogItemById(id: string): Promise<BitemporalBacklogItem | null> {
  try {
    const rows = await client`
      SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to
      FROM current_backlog_items
      WHERE id = ${id} AND valid_to = 'infinity'
      ORDER BY valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalBacklogItem;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get backlog item");
  }
}

export async function getBacklogItemByItemId(
  itemType: "feature" | "bug",
  itemId: string
): Promise<BitemporalBacklogItem | null> {
  try {
    const rows = await client`
      SELECT id, version_id, item_type, item_id, rank, sprint_label, notes, valid_from, valid_to
      FROM current_backlog_items
      WHERE item_type = ${itemType} AND item_id = ${itemId} AND valid_to = 'infinity'
      ORDER BY valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as unknown as BitemporalBacklogItem;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get backlog item by reference");
  }
}

export async function promoteToBacklog(params: {
  id: string;
  itemType: "feature" | "bug";
  itemId: string;
  rank?: number;
  sprintLabel?: string;
  notes?: string;
  maintainedBy?: string;
}): Promise<string> {
  try {
    // Guard: skip if already on the backlog
    const existing = await getBacklogItemByItemId(params.itemType, params.itemId);
    if (existing) {
      return existing.version_id as string;
    }

    // Calculate next rank if not provided
    let rank = params.rank;
    if (rank === undefined) {
      const maxRankRows = await client`
        SELECT COALESCE(MAX(rank), 0) + 1 AS next_rank FROM current_backlog_items WHERE valid_to = 'infinity'
      `;
      rank = maxRankRows[0].next_rank as number;
    }

    const rows = await client`
      SELECT insert_backlog_item_version(
        ${params.id}::uuid,
        ${params.itemType}::varchar,
        ${params.itemId}::uuid,
        ${rank}::integer,
        ${params.sprintLabel ?? null}::varchar,
        ${params.notes ?? null}::text,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to promote to backlog");
  }
}

export async function updateBacklogItem(params: {
  id: string;
  rank?: number;
  sprintLabel?: string;
  notes?: string;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT update_backlog_item_version(
        ${params.id}::uuid,
        ${params.rank ?? null}::integer,
        ${params.sprintLabel ?? null}::varchar,
        ${params.notes ?? null}::text,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update backlog item");
  }
}

/**
 * Bulk-update ranks for multiple backlog items (used after drag reorder).
 * Each entry: { id, rank }.
 */
export async function bulkUpdateRanks(
  items: Array<{ id: string; rank: number }>,
  maintainedBy?: string
): Promise<void> {
  try {
    for (const item of items) {
      await client`
        SELECT update_backlog_item_version(
          ${item.id}::uuid,
          ${item.rank}::integer,
          ${null}::varchar,
          ${null}::text,
          ${new Date()}::timestamptz,
          ${maintainedBy ?? null}::uuid
        ) AS version_id
      `;
    }
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to bulk update ranks");
  }
}

/**
 * Move a backlog item to a new status column and optionally update rank.
 * Updates the underlying feature/bug status and the backlog item rank.
 */
export async function moveBacklogItemStatus(params: {
  backlogItemId: string;
  newStatus: CascadeStatus;
  newRank?: number;
  maintainedBy?: string;
}): Promise<void> {
  try {
    // Look up the backlog item to find the underlying feature/bug
    const item = await getBacklogItemById(params.backlogItemId);
    if (!item) {
      throw new ChatSDKError("not_found:backlog", "Backlog item not found");
    }

    // Update the feature or bug status
    if (item.item_type === "feature") {
      await updateFeature({ id: item.item_id, status: params.newStatus, maintainedBy: params.maintainedBy });
    } else {
      await updateBug({ id: item.item_id, status: params.newStatus, maintainedBy: params.maintainedBy });
    }

    // Update rank if provided
    if (params.newRank !== undefined) {
      await updateBacklogItem({ id: params.backlogItemId, rank: params.newRank, maintainedBy: params.maintainedBy });
    }
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError("bad_request:database", "Failed to move backlog item");
  }
}

// =============================================================================
// ITEM-DOCUMENT LINK QUERIES
// =============================================================================

export async function linkDocumentToItem(params: {
  id: string;
  itemType: ItemType;
  itemId: string;
  documentId: string;
  linkType?: LinkType;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_item_document_link_version(
        ${params.id}::uuid,
        ${params.itemType}::varchar,
        ${params.itemId}::uuid,
        ${params.documentId}::uuid,
        ${params.linkType ?? "specification"}::varchar,
        ${new Date()}::timestamptz,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to link document to item");
  }
}

export async function unlinkDocumentFromItem(linkId: string): Promise<void> {
  try {
    await client`
      SELECT delete_item_document_link(${linkId}::uuid)
    `;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to unlink document from item");
  }
}

export async function getDocumentsForItem(
  itemType: ItemType,
  itemId: string
): Promise<BitemporalItemDocumentLink[]> {
  try {
    const rows = await client`
      SELECT id, version_id, item_type, item_id, document_id, link_type, valid_from, valid_to
      FROM current_item_document_links
      WHERE item_type = ${itemType} AND item_id = ${itemId}
        AND valid_to = 'infinity'
      ORDER BY valid_from DESC
    `;
    return rows as unknown as BitemporalItemDocumentLink[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get documents for item");
  }
}

export async function getItemsForDocument(
  documentId: string
): Promise<BitemporalItemDocumentLink[]> {
  try {
    const rows = await client`
      SELECT id, version_id, item_type, item_id, document_id, link_type, valid_from, valid_to
      FROM current_item_document_links
      WHERE document_id = ${documentId}
        AND valid_to = 'infinity'
      ORDER BY valid_from DESC
    `;
    return rows as unknown as BitemporalItemDocumentLink[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get items for document");
  }
}

/** Get all links for a given item with document titles */
export async function getDocumentLinksWithTitles(
  itemType: ItemType,
  itemId: string
): Promise<(BitemporalItemDocumentLink & { document_title: string })[]> {
  try {
    const rows = await client`
      SELECT l.id, l.version_id, l.item_type, l.item_id, l.document_id, l.link_type,
             l.valid_from, l.valid_to, d.title AS document_title
      FROM current_item_document_links l
      JOIN current_documents d ON l.document_id = d.id
      WHERE l.item_type = ${itemType} AND l.item_id = ${itemId}
        AND l.valid_to = 'infinity'
      ORDER BY l.valid_from DESC
    `;
    return rows as unknown as (BitemporalItemDocumentLink & { document_title: string })[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get document links with titles");
  }
}

// =============================================================================
// CAPABILITIES
// =============================================================================

export interface BitemporalCapability {
  id: string;
  version_id: string;
  name: string;
  description: string | null;
  sdlc_phase: SdlcPhase;
  sort_order: number;
  status: CapabilityStatus;
  maintained_by: string | null;
  valid_from: Date;
  valid_to: Date;
}

export interface BitemporalCapabilitySummary {
  id: string;
  name: string;
  sdlc_phase: SdlcPhase;
  sort_order: number;
  status: CapabilityStatus;
  feature_count: number;
  bug_count: number;
  task_count: number;
}

export interface BitemporalCapabilityItem {
  id: string;
  version_id: string;
  capability_id: string;
  item_type: ItemType;
  item_id: string;
  valid_from: Date;
  valid_to: Date;
}

/** List capabilities with optional filters and item counts */
export async function listCapabilities(filters?: {
  status?: CapabilityStatus;
  sdlc_phase?: SdlcPhase;
}): Promise<BitemporalCapabilitySummary[]> {
  try {
    const conditions: string[] = ["c.valid_to = 'infinity'"];
    if (filters?.status) conditions.push(`c.status = '${filters.status}'`);
    if (filters?.sdlc_phase) conditions.push(`c.sdlc_phase = '${filters.sdlc_phase}'`);

    const rows = await client`
      SELECT
        c.id, c.name, c.sdlc_phase, c.sort_order, c.status,
        COALESCE(SUM(CASE WHEN ci.item_type = 'feature' THEN 1 ELSE 0 END), 0)::int AS feature_count,
        COALESCE(SUM(CASE WHEN ci.item_type = 'bug' THEN 1 ELSE 0 END), 0)::int AS bug_count,
        COALESCE(SUM(CASE WHEN ci.item_type = 'task' THEN 1 ELSE 0 END), 0)::int AS task_count
      FROM current_capabilities c
      LEFT JOIN current_capability_items ci
        ON ci.capability_id = c.id AND ci.valid_to = 'infinity'
      WHERE ${client.unsafe(conditions.join(" AND "))}
      GROUP BY c.id, c.name, c.sdlc_phase, c.sort_order, c.status
      ORDER BY c.sort_order ASC
    `;
    return rows as unknown as BitemporalCapabilitySummary[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to list capabilities");
  }
}

/** Get a single capability by ID with full details */
export async function getCapabilityById(id: string): Promise<BitemporalCapability | null> {
  try {
    const rows = await client`
      SELECT * FROM current_capabilities
      WHERE id = ${id} AND valid_to = 'infinity'
      ORDER BY valid_from DESC LIMIT 1
    `;
    return (rows[0] as unknown as BitemporalCapability) ?? null;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get capability");
  }
}

/** Get all items assigned to a capability */
export async function getCapabilityItems(capabilityId: string): Promise<{
  features: BitemporalFeatureSummary[];
  bugs: { id: string; title: string; status: string; severity: string; priority: string }[];
}> {
  try {
    const featureRows = await client`
      SELECT f.id, f.title, f.status, f.priority, f.feature_type, f.repository_id, f.valid_from
      FROM current_capability_items ci
      JOIN current_features f ON ci.item_id = f.id AND f.valid_to = 'infinity'
      WHERE ci.capability_id = ${capabilityId}
        AND ci.item_type = 'feature'
        AND ci.valid_to = 'infinity'
      ORDER BY f.valid_from DESC
    `;
    const bugRows = await client`
      SELECT b.id, b.title, b.status, b.severity, b.priority
      FROM current_capability_items ci
      JOIN current_bugs b ON ci.item_id = b.id AND b.valid_to = 'infinity'
      WHERE ci.capability_id = ${capabilityId}
        AND ci.item_type = 'bug'
        AND ci.valid_to = 'infinity'
      ORDER BY b.valid_from DESC
    `;
    return {
      features: featureRows as unknown as BitemporalFeatureSummary[],
      bugs: bugRows as unknown as { id: string; title: string; status: string; severity: string; priority: string }[],
    };
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get capability items");
  }
}

/** Get capabilities for a given item (feature/bug/task) */
export async function getCapabilitiesForItem(
  itemType: ItemType,
  itemId: string
): Promise<{ id: string; name: string; sdlc_phase: SdlcPhase; link_id: string }[]> {
  try {
    const rows = await client`
      SELECT c.id, c.name, c.sdlc_phase, ci.id AS link_id
      FROM current_capability_items ci
      JOIN current_capabilities c ON ci.capability_id = c.id AND c.valid_to = 'infinity'
      WHERE ci.item_type = ${itemType} AND ci.item_id = ${itemId}
        AND ci.valid_to = 'infinity'
      ORDER BY c.sort_order ASC
    `;
    return rows as unknown as { id: string; name: string; sdlc_phase: SdlcPhase; link_id: string }[];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get capabilities for item");
  }
}

/** Assign an item to a capability */
export async function assignItemToCapability(params: {
  capabilityId: string;
  itemType: ItemType;
  itemId: string;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_capability_item_version(
        ${crypto.randomUUID()}::uuid,
        ${params.capabilityId}::uuid,
        ${params.itemType}::varchar,
        ${params.itemId}::uuid,
        CURRENT_TIMESTAMP,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return (rows[0] as any).version_id;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to assign item to capability");
  }
}

/** Unassign an item from a capability (soft-delete) */
export async function unassignItemFromCapability(linkId: string): Promise<void> {
  try {
    await client`SELECT delete_capability_item(${linkId}::uuid)`;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to unassign item from capability");
  }
}

/** Update a capability (bitemporal versioning) */
export async function updateCapability(params: {
  id: string;
  name?: string;
  description?: string;
  sdlc_phase?: SdlcPhase;
  sort_order?: number;
  status?: CapabilityStatus;
  maintainedBy?: string;
}): Promise<string> {
  try {
    const rows = await client`
      SELECT update_capability_version(
        ${params.id}::uuid,
        ${params.name ?? null}::varchar,
        ${params.description ?? null}::text,
        ${params.sdlc_phase ?? null}::varchar,
        ${params.sort_order ?? null}::int,
        ${params.status ?? null}::varchar,
        CURRENT_TIMESTAMP,
        ${params.maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return (rows[0] as any).version_id;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to update capability");
  }
}

/** Get a map of item IDs to their capability IDs for bulk filtering */
export async function getCapabilityItemsMap(
  itemType: ItemType
): Promise<Record<string, string[]>> {
  try {
    const rows = await client`
      SELECT ci.item_id, ci.capability_id
      FROM current_capability_items ci
      WHERE ci.item_type = ${itemType}
        AND ci.valid_to = 'infinity'
    `;
    const map: Record<string, string[]> = {};
    for (const row of rows) {
      const r = row as { item_id: string; capability_id: string };
      if (!map[r.item_id]) map[r.item_id] = [];
      map[r.item_id].push(r.capability_id);
    }
    return map;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get capability items map");
  }
}
