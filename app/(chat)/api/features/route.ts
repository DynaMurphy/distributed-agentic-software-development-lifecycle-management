import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import {
  listFeatures,
  getFeatureById,
  getFeatureVersions,
  getSubFeatures,
  createFeature,
  updateFeature,
  restoreFeatureVersion,
  promoteToBacklog,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/features
 *   - No id: list features (supports ?status=, ?priority=, ?featureType=, ?parentId= filters)
 *   - With id: get feature detail or version history (?versions=true)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const status = searchParams.get("status") as any;
    const priority = searchParams.get("priority") as any;
    const featureType = searchParams.get("featureType") as any;
    const parentId = searchParams.get("parentId") ?? undefined;
    const repositoryId = searchParams.get("repositoryId") ?? undefined;
    const productId = searchParams.get("productId") ?? undefined;

    const features = await listFeatures({ status, priority, featureType, parentId, repositoryId, productId });
    return Response.json(features, { status: 200 });
  }

  const versions = searchParams.get("versions");
  if (versions === "true") {
    const featureVersions = await getFeatureVersions(id);
    return Response.json(featureVersions, { status: 200 });
  }

  const feature = await getFeatureById(id);
  if (!feature) {
    return new ChatSDKError("not_found:feature").toResponse();
  }

  // Safety: unwrap double-serialized ai_metadata (stored as JSONB string)
  if (feature.ai_metadata && typeof feature.ai_metadata === "string") {
    try {
      feature.ai_metadata = JSON.parse(feature.ai_metadata);
    } catch {
      feature.ai_metadata = {};
    }
  }

  const subFeatures = await getSubFeatures(id);

  return Response.json({ ...feature, subFeatures }, { status: 200 });
}

/**
 * POST /api/features
 *   Create a new feature. Body: { title, description?, featureType?, parentId?, priority?, ... }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await createFeature({
      id,
      title: body.title,
      description: body.description,
      featureType: body.featureType,
      parentId: body.parentId,
      status: body.status,
      priority: body.priority,
      effortEstimate: body.effortEstimate,
      createdBy: session.user.id,
      assignedTo: body.assignedTo,
      tags: body.tags,
      aiMetadata: body.aiMetadata,
      repositoryId: body.repositoryId,
      maintainedBy: session.user.id,
    });

    // Auto-add to backlog in draft state
    await promoteToBacklog({
      id: generateUUID(),
      itemType: "feature",
      itemId: id,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return new ChatSDKError("bad_request:feature").toResponse();
  }
}

/**
 * PUT /api/features?id=...&versionId=...
 *   Restore a previous version. Creates a new version with the same data.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const versionId = searchParams.get("versionId");
  if (!id || !versionId) {
    return new ChatSDKError("bad_request:feature").toResponse();
  }

  try {
    const newVersionId = await restoreFeatureVersion(id, versionId);
    return Response.json({ id, versionId: newVersionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:feature").toResponse();
  }
}

/**
 * PATCH /api/features?id=...
 *   Update feature fields. Body: { title?, description?, status?, priority?, ... }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:feature").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatSDKError("bad_request:feature").toResponse();
  }

  try {
    const body = await request.json();

    const versionId = await updateFeature({
      id,
      title: body.title,
      description: body.description,
      featureType: body.featureType,
      parentId: body.parentId,
      status: body.status,
      priority: body.priority,
      effortEstimate: body.effortEstimate,
      assignedTo: body.assignedTo,
      tags: body.tags,
      aiMetadata: body.aiMetadata,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:feature").toResponse();
  }
}
