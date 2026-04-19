import { auth } from "@/app/(auth)/auth";
import { guestWriteGuard } from "@/lib/auth-guard";
import {
  listRepositories,
  getRepositoryById,
  createRepository,
  updateRepository,
} from "@/lib/db/bitemporal-work-items";
import { ChatSDKError } from "@/lib/errors";
import { generateUUID } from "@/lib/utils";

/**
 * GET /api/repositories
 *   - No id: list repositories (supports ?status= filter)
 *   - With id: get repository detail
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    const status = searchParams.get("status") as any;
    const repos = await listRepositories({ status });
    return Response.json(repos, { status: 200 });
  }

  const repo = await getRepositoryById(id);
  if (!repo) {
    return Response.json({ error: "Repository not found" }, { status: 404 });
  }

  return Response.json(repo, { status: 200 });
}

/**
 * POST /api/repositories
 *   Create a new repository. Body: { name, fullName?, description?, githubUrl?, defaultBranch? }
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  try {
    const body = await request.json();
    const id = body.id ?? generateUUID();

    const versionId = await createRepository({
      id,
      name: body.name,
      fullName: body.fullName,
      description: body.description,
      githubUrl: body.githubUrl,
      defaultBranch: body.defaultBranch,
      settings: body.settings,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 201 });
  } catch (error) {
    return Response.json({ error: "Failed to create repository" }, { status: 400 });
  }
}

/**
 * PATCH /api/repositories?id=...
 *   Update repository fields. Body: { name?, fullName?, description?, githubUrl?, status?, ... }
 */
export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }
  const guestError = guestWriteGuard(session, "feature");
  if (guestError) return guestError;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return Response.json({ error: "Repository ID is required" }, { status: 400 });
  }

  try {
    const body = await request.json();

    const versionId = await updateRepository({
      id,
      name: body.name,
      fullName: body.fullName,
      description: body.description,
      githubUrl: body.githubUrl,
      defaultBranch: body.defaultBranch,
      status: body.status,
      settings: body.settings,
      maintainedBy: session.user.id,
    });

    return Response.json({ id, versionId }, { status: 200 });
  } catch (error) {
    return Response.json({ error: "Failed to update repository" }, { status: 400 });
  }
}
