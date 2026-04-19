import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import {
  getMilestoneById,
  updateMilestone,
  getMilestoneItems,
  addMilestoneItem,
  removeMilestoneItem,
  listMilestones,
  type MilestoneStatus,
  type ReleaseType,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";

/**
 * GET /api/milestones/[milestoneId]
 *   Fetch a single milestone with its assigned items.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  const { milestoneId } = await params;

  try {
    const milestone = await getMilestoneById(milestoneId);
    if (!milestone) {
      return Response.json({ error: "Milestone not found" }, { status: 404 });
    }

    const items = await getMilestoneItems(milestoneId);

    return Response.json({ ...milestone, items }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to fetch milestone" }, { status: 500 });
  }
}

/**
 * PATCH /api/milestones/[milestoneId]
 *   Update a milestone.
 *   Body: { title?, description?, versionLabel?, targetDate?, startDate?, status?, capacityLimit?, capacityUnit?, tags? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { milestoneId } = await params;

  try {
    const body = await request.json();
    const currentMilestone = await getMilestoneById(milestoneId);
    if (!currentMilestone) {
      return Response.json({ error: "Milestone not found" }, { status: 404 });
    }

    const nextTargetDate = body.targetDate ?? currentMilestone.target_date;
    const nextReleaseType = (body.releaseType as ReleaseType | undefined) ?? currentMilestone.release_type;

    if (nextTargetDate && nextReleaseType) {
      const oppositeType = nextReleaseType === "major" ? "minor" : "major";
      const existing = await listMilestones({ releaseType: oppositeType });
      const hasConflict = existing.some(
        (m) => m.id !== milestoneId && m.target_date?.slice(0, 10) === String(nextTargetDate).slice(0, 10),
      );
      if (hasConflict) {
        return Response.json(
          { error: `A ${oppositeType} release already exists on ${String(nextTargetDate).slice(0, 10)}. Choose another date.` },
          { status: 409 },
        );
      }
    }

    const versionId = await updateMilestone({
      id: milestoneId,
      title: body.title,
      description: body.description,
      versionLabel: body.versionLabel,
      targetDate: body.targetDate,
      startDate: body.startDate,
      status: body.status as MilestoneStatus | undefined,
      capacityLimit: body.capacityLimit,
      capacityUnit: body.capacityUnit,
      tags: body.tags,
      aiMetadata: body.aiMetadata,
      maintainedBy: session.user.id,
      releaseType: body.releaseType as ReleaseType | undefined,
      releaseSequence: body.releaseSequence,
    });

    return Response.json({ versionId }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to update milestone" }, { status: 500 });
  }
}

/**
 * POST /api/milestones/[milestoneId]
 *   Add or remove an item from a milestone.
 *   Body: { action: "add" | "remove", itemType: "feature" | "bug" | "capability", itemId: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ milestoneId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { milestoneId } = await params;

  try {
    const body = await request.json();
    const { action, itemType, itemId } = body;

    if (!action || !itemType || !itemId) {
      return Response.json({ error: "action, itemType, and itemId are required" }, { status: 400 });
    }

    if (action === "add") {
      const id = await addMilestoneItem({
        milestoneId,
        itemType,
        itemId,
        addedBy: session.user.id,
      });
      return Response.json({ id }, { status: 201 });
    }

    if (action === "remove") {
      await removeMilestoneItem({ milestoneId, itemType, itemId });
      return Response.json({ success: true }, { status: 200 });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: "Failed to manage milestone item" }, { status: 500 });
  }
}
