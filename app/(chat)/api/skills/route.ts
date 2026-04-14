import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  resolveSkills,
  resolveSkill,
  type ResolverConfig,
} from "@/lib/skills";

function getResolverConfig(): ResolverConfig {
  return { hubRoot: process.cwd() };
}

/**
 * GET /api/skills
 * Query params:
 *   ?name=triage  — fetch a single skill by name
 *   (none)        — list all skills
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const config = getResolverConfig();
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (name) {
    const skill = resolveSkill(name, config);
    if (!skill) {
      return new ChatSDKError("not_found:chat").toResponse();
    }
    return Response.json(skill);
  }

  const skills = resolveSkills(config);
  return Response.json(skills);
}

/**
 * PUT /api/skills
 * Body: { name: string, content: string }
 * Saves/updates a skill SKILL.md file in the hub-global skills directory.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const { name, content } = body as { name: string; content: string };

  if (!name || !content) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  // Validate skill name (alphanumeric + hyphens only)
  if (!/^[a-z0-9-]+$/.test(name)) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  const skillDir = path.join(process.cwd(), "splm-skills", name);
  const skillPath = path.join(skillDir, "SKILL.md");

  if (!existsSync(skillDir)) {
    await mkdir(skillDir, { recursive: true });
  }

  await writeFile(skillPath, content, "utf-8");

  const skill = resolveSkill(name, getResolverConfig());
  return Response.json(skill);
}
