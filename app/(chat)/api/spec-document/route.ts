import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import {
  getBitemporalDocumentById,
  getBitemporalDocumentVersions,
  listBitemporalDocuments,
  saveBitemporalDocument,
  updateBitemporalDocumentTitle,
} from "@/lib/db/bitemporal-queries";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/spec-document
 *   - No id param: list all current bitemporal documents
 *   - With id param: get all versions for that document (for version footer)
 */
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    // List all current spec documents
    const repositoryId = searchParams.get("repositoryId") ?? undefined;
    const productId = searchParams.get("productId") ?? undefined;
    const documents = await listBitemporalDocuments({ repositoryId, productId });
    return Response.json(documents, { status: 200 });
  }

  // Get all versions of a specific document
  const versions = await getBitemporalDocumentVersions(id);

  if (versions.length === 0) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  // Map bitemporal versions to a shape compatible with the version footer
  // The version footer expects { id, createdAt, title, content, kind, userId }
  const mappedVersions = versions.map((v) => ({
    id: v.id,
    createdAt: v.valid_from,
    title: v.title,
    content: v.content,
    kind: "spec" as const,
    userId: session.user.id,
    maintainedByEmail: v.maintained_by_email,
  }));

  return Response.json(mappedVersions, { status: 200 });
}

/**
 * POST /api/spec-document?id=...
 *   Explicit save: creates a new bitemporal version via update_document_version().
 *   Body: { title: string, content: string }
 */
export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }
  const guestError = guestWriteGuard(session, "document");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  const { title, content }: { title: string; content: string } =
    await request.json();

  if (!title || !content) {
    return new ChatSDKError(
      "bad_request:api",
      "Both title and content are required."
    ).toResponse();
  }

  const versionId = await saveBitemporalDocument(id, title, content, session.user.id);

  // Return the saved document in a shape compatible with the version footer
  const doc = await getBitemporalDocumentById(id);

  return Response.json(
    {
      id: doc?.id ?? id,
      createdAt: doc?.valid_from ?? new Date(),
      title: doc?.title ?? title,
      content: doc?.content ?? content,
      kind: "spec" as const,
      userId: session.user.id,
      versionId,
    },
    { status: 200 }
  );
}

/**
 * PATCH /api/spec-document?id=...
 *   Update only the title of a spec document.
 *   Body: { title: string }
 */
export async function PATCH(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:document").toResponse();
  }
  const guestError = guestWriteGuard(session, "document");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter id is required."
    ).toResponse();
  }

  const { title }: { title: string } = await request.json();

  if (!title || title.trim().length === 0) {
    return new ChatSDKError(
      "bad_request:api",
      "Title must not be empty."
    ).toResponse();
  }

  if (title.length > 255) {
    return new ChatSDKError(
      "bad_request:api",
      "Title must not exceed 255 characters."
    ).toResponse();
  }

  const doc = await getBitemporalDocumentById(id);

  if (!doc) {
    return new ChatSDKError("not_found:document").toResponse();
  }

  await updateBitemporalDocumentTitle(id, title.trim());

  const updatedDoc = await getBitemporalDocumentById(id);

  return Response.json(updatedDoc, { status: 200 });
}
