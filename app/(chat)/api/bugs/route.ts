import { auth } from "@/app/(auth)/auth";
import {
  listBugs,
  getBugById,
  getBugVersions,
  createBug,
  updateBug,
  restoreBugVersion,
  promoteToBacklog,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/bugs
 *   - No id: list bugs (supports ?status=, ?priority=, ?severity= filters)
 *   - With id: get bug detail or version history (?versions=true)
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:bug").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const status = searchParams.get("status") as any;
    const priority = searchParams.get("priority") as any;
    const severity = searchParams.get("severity") as any;
    const repositoryId = searchParams.get("repositoryId") ?? undefined;

    const bugs = await listBugs({ status, priority, severity, repositoryId });
    return Response.json(bugs, { status: 200 });
  }

  const versions = searchParams.get("versions");
  if (versions === "true") {
    const bugVersions = await getBugVersions(id);
    return Response.json(bugVersions, { status: 200 });
  }

  const bug = await getBugById(id);
  if (!bug) {
    return new ChatSDKError("not_found:bug").toResponse();
  }

  return Response.json(bug, { status: 200 });
}

/**
 * POST /api/bugs
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:bug").toResponse();
  }

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await createBug({
      id,
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: body.status,
      priority: body.priority,
      stepsToReproduce: body.stepsToReproduce,
      expectedBehavior: body.expectedBehavior,
      actualBehavior: body.actualBehavior,
      environment: body.environment,
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
      itemType: "bug",
      itemId: id,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return new ChatSDKError("bad_request:bug").toResponse();
  }
}

/**
 * PUT /api/bugs?id=...&versionId=...
 *   Restore a previous version. Creates a new version with the same data.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:bug").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const versionId = searchParams.get("versionId");
  if (!id || !versionId) {
    return new ChatSDKError("bad_request:bug").toResponse();
  }

  try {
    const newVersionId = await restoreBugVersion(id, versionId);
    return Response.json({ id, versionId: newVersionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:bug").toResponse();
  }
}

/**
 * PATCH /api/bugs?id=...
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:bug").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatSDKError("bad_request:bug").toResponse();
  }

  try {
    const body = await request.json();

    const versionId = await updateBug({
      id,
      title: body.title,
      description: body.description,
      severity: body.severity,
      status: body.status,
      priority: body.priority,
      stepsToReproduce: body.stepsToReproduce,
      expectedBehavior: body.expectedBehavior,
      actualBehavior: body.actualBehavior,
      environment: body.environment,
      assignedTo: body.assignedTo,
      tags: body.tags,
      aiMetadata: body.aiMetadata,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:bug").toResponse();
  }
}
