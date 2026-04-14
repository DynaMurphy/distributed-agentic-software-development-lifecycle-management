import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  resolveTemplates,
  resolveTemplate,
  listAvailableTemplates,
  type ResolverConfig,
} from "@/lib/skills";

function getResolverConfig(): ResolverConfig {
  return { hubRoot: process.cwd() };
}

/**
 * GET /api/templates
 * Query params:
 *   ?category=feature&name=default  — fetch a single template
 *   (none)                          — list all templates
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const config = getResolverConfig();
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const name = searchParams.get("name");

  if (category && name) {
    const template = resolveTemplate(category, name, config);
    if (!template) {
      return new ChatSDKError("not_found:chat").toResponse();
    }
    return Response.json(template);
  }

  const templates = resolveTemplates(config);
  return Response.json(templates);
}

/**
 * PUT /api/templates
 * Body: { category: string, name: string, content: string }
 * Saves/updates a template file in hub-global templates directory.
 */
export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const { category, name, content } = body as {
    category: string;
    name: string;
    content: string;
  };

  if (!category || !name || !content) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  // Validate names (alphanumeric + hyphens only)
  if (!/^[a-z0-9-]+$/.test(category) || !/^[a-z0-9-]+$/.test(name)) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  const templateDir = path.join(process.cwd(), "splm-templates", category);
  const templatePath = path.join(templateDir, `${name}.md`);

  if (!existsSync(templateDir)) {
    await mkdir(templateDir, { recursive: true });
  }

  await writeFile(templatePath, content, "utf-8");

  const template = resolveTemplate(category, name, getResolverConfig());
  return Response.json(template);
}
