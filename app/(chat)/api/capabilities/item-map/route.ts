import { auth } from "@/app/(auth)/auth";
import { getCapabilityItemsMap } from "@/lib/db/bitemporal-work-items";
import type { ItemType } from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/capabilities/item-map?itemType=feature|bug
 *
 * Returns a map of item IDs to their capability IDs for bulk filtering.
 * Response: { [itemId: string]: string[] }
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const itemType = searchParams.get("itemType") as ItemType | null;

  if (!itemType || !["feature", "bug", "task"].includes(itemType)) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const map = await getCapabilityItemsMap(itemType);
  return Response.json(map, { status: 200 });
}
