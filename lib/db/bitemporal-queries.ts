import "server-only";

import postgres from "postgres";
import { ChatSDKError } from "../errors";

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);

/**
 * Shape of a row from the bitemporal `documents` / `current_documents` view.
 */
export interface BitemporalDocument {
  id: string;
  version_id: string;
  title: string;
  content: string | null;
  valid_from: Date;
  valid_to: Date;
  maintained_by: string | null;
  maintained_by_email: string | null;
}

/**
 * Minimal shape for list results.
 */
export interface BitemporalDocumentSummary {
  id: string;
  version_id: string;
  title: string;
  valid_from: Date;
}

/**
 * List all current bitemporal documents (latest transaction-time state).
 */
export async function listBitemporalDocuments(filters?: {
  repositoryId?: string;
}): Promise<
  BitemporalDocumentSummary[]
> {
  try {
    let query = `
      SELECT DISTINCT ON (id) id, version_id, title, valid_from
      FROM current_documents
    `;
    if (filters?.repositoryId) {
      query += ` WHERE repository_id = '${filters.repositoryId}'`;
    }
    query += ` ORDER BY id, valid_from DESC`;
    const rows = await client.unsafe(query);
    return rows as unknown as BitemporalDocumentSummary[];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to list bitemporal documents"
    );
  }
}

/**
 * Get the latest current version of a bitemporal document by business ID.
 */
export async function getBitemporalDocumentById(
  id: string
): Promise<BitemporalDocument | null> {
  try {
    const rows = await client`
      SELECT d.id, d.version_id, d.title, d.content, d.valid_from, d.valid_to,
             d.maintained_by, u.email AS maintained_by_email
      FROM current_documents d
      LEFT JOIN "User" u ON d.maintained_by = u.id
      WHERE d.id = ${id}
      ORDER BY d.valid_from DESC
      LIMIT 1
    `;
    if (rows.length === 0) return null;
    return rows[0] as BitemporalDocument;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bitemporal document by id"
    );
  }
}

/**
 * Get all versions of a bitemporal document (for version history).
 * Returns rows ordered by valid_from ascending.
 */
export async function getBitemporalDocumentVersions(
  id: string
): Promise<BitemporalDocument[]> {
  try {
    const rows = await client`
      SELECT d.id, d.version_id, d.title, d.content, d.valid_from, d.valid_to,
             d.maintained_by, u.email AS maintained_by_email
      FROM documents d
      LEFT JOIN "User" u ON d.maintained_by = u.id
      WHERE d.id = ${id}
      ORDER BY d.valid_from ASC
    `;
    return rows as unknown as BitemporalDocument[];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get bitemporal document versions"
    );
  }
}

/**
 * Save (update) a bitemporal document. Creates a new version via the
 * `update_document_version()` stored function, which handles closing the
 * previous version's validity period.
 */
export async function saveBitemporalDocument(
  id: string,
  title: string,
  content: string,
  maintainedBy?: string
): Promise<string> {
  try {
    const rows = await client`
      SELECT update_document_version(
        ${id}::uuid,
        ${title}::varchar,
        ${content}::text,
        ${null}::timestamptz,
        ${maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save bitemporal document"
    );
  }
}

/**
 * Update only the title of a bitemporal document (all versions).
 */
export async function updateBitemporalDocumentTitle(
  id: string,
  title: string
): Promise<void> {
  try {
    await client`
      UPDATE documents
      SET title = ${title}
      WHERE id = ${id}
    `;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update bitemporal document title"
    );
  }
}

/**
 * Create a new bitemporal document via the `insert_document_version()` stored function.
 */
export async function createBitemporalDocument(
  id: string,
  title: string,
  content: string,
  maintainedBy?: string
): Promise<string> {
  try {
    const rows = await client`
      SELECT insert_document_version(
        ${id}::uuid,
        ${title}::varchar,
        ${content}::text,
        ${null}::timestamptz,
        ${maintainedBy ?? null}::uuid
      ) AS version_id
    `;
    return rows[0].version_id as string;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create bitemporal document"
    );
  }
}
