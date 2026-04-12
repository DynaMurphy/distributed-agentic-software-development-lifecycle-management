import { auth } from "@/app/(auth)/auth";
import {
  linkDocumentToItem,
  getDocumentsForItem,
  getDocumentLinksWithTitles,
  getItemsForDocument,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/item-links
 *   - With itemType + itemId: get documents linked to an item
 *   - With documentId: get items linked to a document
 *   - With itemType + itemId + titles=true: get documents with titles
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:backlog").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("itemType") as any;
  const itemId = searchParams.get("itemId");
  const documentId = searchParams.get("documentId");
  const titles = searchParams.get("titles");

  if (itemType && itemId) {
    if (titles === "true") {
      const links = await getDocumentLinksWithTitles(itemType, itemId);
      return Response.json(links, { status: 200 });
    }
    const links = await getDocumentsForItem(itemType, itemId);
    return Response.json(links, { status: 200 });
  }

  if (documentId) {
    const links = await getItemsForDocument(documentId);
    return Response.json(links, { status: 200 });
  }

  return new ChatSDKError("bad_request:backlog").toResponse();
}

/**
 * POST /api/item-links
 * Link a document to a work item
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:backlog").toResponse();
  }

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await linkDocumentToItem({
      id,
      itemType: body.itemType,
      itemId: body.itemId,
      documentId: body.documentId,
      linkType: body.linkType ?? "related",
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return new ChatSDKError("bad_request:backlog").toResponse();
  }
}
