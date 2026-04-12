import { auth } from "@/app/(auth)/auth";
import {
  getBacklog,
  promoteToBacklog,
  getBacklogItemById,
  updateBacklogItem,
  bulkUpdateRanks,
  moveBacklogItemStatus,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/backlog
 *   - No id: list backlog items (supports ?status=, ?priority= filters)
 *   - With id: get specific backlog item detail
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:backlog").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const sprintLabel = searchParams.get("sprintLabel") ?? undefined;
    const itemType = searchParams.get("itemType") as any;

    const backlog = await getBacklog({ sprintLabel, itemType });
    return Response.json(backlog, { status: 200 });
  }

  const item = await getBacklogItemById(id);
  if (!item) {
    return new ChatSDKError("not_found:backlog").toResponse();
  }

  return Response.json(item, { status: 200 });
}

/**
 * POST /api/backlog
 * Promote a feature or bug to the backlog
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:backlog").toResponse();
  }

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await promoteToBacklog({
      id,
      itemType: body.itemType,
      itemId: body.itemId,
      rank: body.rank,
      sprintLabel: body.sprintLabel,
      notes: body.notes,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return new ChatSDKError("bad_request:backlog").toResponse();
  }
}

/**
 * PATCH /api/backlog?id=...
 * Update backlog item (priority, rank, status, etc.)
 *
 * Supports three modes:
 *  1. Regular update: { rank?, sprintLabel?, notes? }
 *  2. Move status:    { action: "moveStatus", newStatus, newRank? }
 *  3. Bulk reorder:   { action: "bulkReorder", items: [{ id, rank }] }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:backlog").toResponse();
  }

  try {
    const body = await request.json();

    // Bulk reorder mode — no id param needed
    if (body.action === "bulkReorder") {
      if (!Array.isArray(body.items)) {
        return new ChatSDKError("bad_request:backlog").toResponse();
      }
      await bulkUpdateRanks(body.items, session.user.id);
      return Response.json({ ok: true }, { status: 200 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return new ChatSDKError("bad_request:backlog").toResponse();
    }

    // Move status mode — update underlying feature/bug status + optional rank
    if (body.action === "moveStatus") {
      await moveBacklogItemStatus({
        backlogItemId: id,
        newStatus: body.newStatus,
        newRank: body.newRank,
        maintainedBy: session.user.id,
      });
      return Response.json({ ok: true }, { status: 200 });
    }

    // Regular update
    const versionId = await updateBacklogItem({
      id,
      rank: body.rank,
      sprintLabel: body.sprintLabel,
      notes: body.notes,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:backlog").toResponse();
  }
}
