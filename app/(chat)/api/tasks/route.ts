import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import {
  listTasks,
  getTaskById,
  createTask,
  updateTask,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/tasks
 *   - No id: list tasks (supports ?status=, ?parentType=, ?parentId= filters)
 *   - With id: get task detail
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:task").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const status = searchParams.get("status") as any;
    const parentType = searchParams.get("parentType") as any;
    const parentId = searchParams.get("parentId") ?? undefined;
    const repositoryId = searchParams.get("repositoryId") ?? undefined;

    const tasks = await listTasks({ status, parentType, parentId, repositoryId });
    return Response.json(tasks, { status: 200 });
  }

  const task = await getTaskById(id);
  if (!task) {
    return new ChatSDKError("not_found:task").toResponse();
  }

  return Response.json(task, { status: 200 });
}

/**
 * POST /api/tasks
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:task").toResponse();
  }
  const guestError = guestWriteGuard(session, "task");
  if (guestError) return guestError;

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await createTask({
      id,
      title: body.title,
      description: body.description,
      status: body.status,
      parentType: body.parentType,
      parentId: body.parentId,
      assignedTo: body.assignedTo,
      effortEstimate: body.effortEstimate,
      tags: body.tags,
      repositoryId: body.repositoryId,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return new ChatSDKError("bad_request:task").toResponse();
  }
}

/**
 * PATCH /api/tasks?id=...
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:task").toResponse();
  }
  const guestError = guestWriteGuard(session, "task");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return new ChatSDKError("bad_request:task").toResponse();
  }

  try {
    const body = await request.json();

    const versionId = await updateTask({
      id,
      title: body.title,
      description: body.description,
      status: body.status,
      assignedTo: body.assignedTo,
      effortEstimate: body.effortEstimate,
      tags: body.tags,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return new ChatSDKError("bad_request:task").toResponse();
  }
}
