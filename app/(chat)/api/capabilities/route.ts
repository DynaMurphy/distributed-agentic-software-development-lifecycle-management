import { auth } from "@/app/(auth)/auth";
import {
  listCapabilities,
  getCapabilityById,
  getCapabilityItems,
  getCapabilitiesForItem,
  assignItemToCapability,
  unassignItemFromCapability,
  updateCapability,
} from "@/lib/db/bitemporal-work-items";
import type { CapabilityStatus, SdlcPhase, ItemType } from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/capabilities
 *   - No id: list capabilities (supports ?status=, ?sdlc_phase= filters)
 *   - With id: get capability detail
 *   - With id + items=true: get capability items (features + bugs)
 *   - With itemType + itemId: get capabilities for a specific item
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const itemType = searchParams.get("itemType") as ItemType | null;
  const itemId = searchParams.get("itemId");

  // Get capabilities for a specific item
  if (itemType && itemId) {
    const caps = await getCapabilitiesForItem(itemType, itemId);
    return Response.json(caps, { status: 200 });
  }

  // List all capabilities
  if (!id) {
    const status = searchParams.get("status") as CapabilityStatus | null;
    const sdlc_phase = searchParams.get("sdlc_phase") as SdlcPhase | null;
    const caps = await listCapabilities({
      status: status ?? undefined,
      sdlc_phase: sdlc_phase ?? undefined,
    });
    return Response.json(caps, { status: 200 });
  }

  // Get items for a capability
  if (searchParams.get("items") === "true") {
    const items = await getCapabilityItems(id);
    return Response.json(items, { status: 200 });
  }

  // Get single capability
  const cap = await getCapabilityById(id);
  if (!cap) {
    return new ChatSDKError("not_found:chat").toResponse();
  }
  return Response.json(cap, { status: 200 });
}

/**
 * POST /api/capabilities
 *   Assign an item to a capability.
 *   Body: { capabilityId, itemType, itemId }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const { capabilityId, itemType, itemId } = body;

  if (!capabilityId || !itemType || !itemId) {
    return Response.json({ error: "capabilityId, itemType, and itemId are required" }, { status: 400 });
  }

  const versionId = await assignItemToCapability({
    capabilityId,
    itemType,
    itemId,
    maintainedBy: session.user.id,
  });

  return Response.json({ assigned: true, versionId }, { status: 200 });
}

/**
 * DELETE /api/capabilities
 *   Unassign an item from a capability.
 *   Query: ?linkId=<uuid>
 */
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const linkId = searchParams.get("linkId");

  if (!linkId) {
    return Response.json({ error: "linkId is required" }, { status: 400 });
  }

  await unassignItemFromCapability(linkId);
  return Response.json({ unassigned: true }, { status: 200 });
}

/**
 * PUT /api/capabilities
 *   Update a capability's fields.
 *   Body: { id, name?, description?, sdlc_phase?, sort_order?, status? }
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const { id, name, description, sdlc_phase, sort_order, status } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const versionId = await updateCapability({
    id,
    name: name ?? undefined,
    description: description ?? undefined,
    sdlc_phase: sdlc_phase ?? undefined,
    sort_order: sort_order ?? undefined,
    status: status ?? undefined,
    maintainedBy: session.user.id,
  });

  return Response.json({ updated: true, versionId }, { status: 200 });
}
