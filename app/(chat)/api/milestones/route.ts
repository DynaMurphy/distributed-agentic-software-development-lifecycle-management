import { auth } from "@/app/(auth)/auth";
import {
  listMilestones,
  createMilestone,
  type MilestoneStatus,
  type ReleaseType,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/milestones
 *   Fetch milestones with optional filters.
 *   Supports ?status=, ?repositoryId= filters
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") as MilestoneStatus | undefined;
  const repositoryId = searchParams.get("repositoryId") ?? undefined;
  const productId = searchParams.get("productId") ?? undefined;
  const releaseType = searchParams.get("releaseType") as ReleaseType | undefined;

  try {
    const milestones = await listMilestones({
      status: status || undefined,
      repositoryId,
      productId,
      releaseType: releaseType || undefined,
    });
    return Response.json(milestones, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to fetch milestones" }, { status: 500 });
  }
}

/**
 * POST /api/milestones
 *   Create a new milestone.
 *   Body: { title, description?, versionLabel?, targetDate?, startDate?, capacityLimit?, capacityUnit?, tags?, repositoryId? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  try {
    const body = await request.json();
    const { title, description, versionLabel, targetDate, startDate, capacityLimit, capacityUnit, tags, repositoryId, productId, releaseType, releaseSequence } = body;

    if (!title) {
      return Response.json({ error: "Title is required" }, { status: 400 });
    }

    if (targetDate && releaseType) {
      const oppositeType = releaseType === "major" ? "minor" : "major";
      const existing = await listMilestones({ repositoryId, releaseType: oppositeType });
      const hasConflict = existing.some((m) => m.target_date?.slice(0, 10) === String(targetDate).slice(0, 10));
      if (hasConflict) {
        return Response.json(
          { error: `A ${oppositeType} release already exists on ${targetDate}. Choose another date.` },
          { status: 409 },
        );
      }
    }

    const id = generateUUID();
    const versionId = await createMilestone({
      id,
      title,
      description,
      versionLabel,
      targetDate,
      startDate,
      capacityLimit,
      capacityUnit,
      tags,
      maintainedBy: session.user.id,
      repositoryId,
      productId,
      releaseType,
      releaseSequence,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: "Failed to create milestone" }, { status: 500 });
  }
}
