import { auth } from "@/app/(auth)/auth";
import {
  getRoadmapItems,
  updateRoadmapSchedule,
  updateRoadmapHorizon,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/roadmap
 *   Fetch roadmap items (features with timeline/horizon data).
 *   Supports ?capabilityId=, ?priority=, ?status=, ?horizon=, ?repositoryId= filters
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const capabilityId = searchParams.get("capabilityId") ?? undefined;
  const priority = searchParams.get("priority") as any;
  const status = searchParams.get("status") as any;
  const horizon = searchParams.get("horizon") as any;
  const repositoryId = searchParams.get("repositoryId") ?? undefined;

  const items = await getRoadmapItems({ capabilityId, priority, status, horizon, repositoryId });
  return Response.json(items, { status: 200 });
}

/**
 * PATCH /api/roadmap
 *   Update a roadmap item's schedule or horizon.
 *   Body: { id, plannedStart?, plannedEnd?, roadmapHorizon? }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  try {
    const body = await request.json();
    const { id, plannedStart, plannedEnd, roadmapHorizon } = body;

    if (!id) {
      return Response.json({ error: "Missing id" }, { status: 400 });
    }

    if (roadmapHorizon !== undefined) {
      const versionId = await updateRoadmapHorizon({
        id,
        roadmapHorizon,
        maintainedBy: session.user.id,
      });
      return Response.json({ versionId }, { status: 200 });
    }

    if (plannedStart !== undefined || plannedEnd !== undefined) {
      const versionId = await updateRoadmapSchedule({
        id,
        plannedStart,
        plannedEnd,
        maintainedBy: session.user.id,
      });
      return Response.json({ versionId }, { status: 200 });
    }

    return Response.json({ error: "No update fields provided" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: "Failed to update roadmap item" }, { status: 500 });
  }
}
