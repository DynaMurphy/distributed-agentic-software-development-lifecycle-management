import { auth } from "@/app/(auth)/auth";
import { ChatSDKError } from "@/lib/errors";
import {
  parseVariables,
  substituteVariables,
  validateTemplate,
  type VariableDefinition,
} from "@/lib/skills";
import { parseFrontmatter } from "@/lib/skills";

/**
 * POST /api/templates/preview
 * Body: { content: string, values?: Record<string, string> }
 * Returns parsed variables, validation results, and a substituted preview.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const body = await request.json();
  const { content, values = {} } = body as {
    content: string;
    values?: Record<string, string>;
  };

  if (!content) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  const { metadata, body: templateBody } = parseFrontmatter(content);

  // Parse variable definitions from frontmatter
  const variableDefs: VariableDefinition[] = Array.isArray(metadata.variables)
    ? (metadata.variables as VariableDefinition[])
    : [];

  const variables = parseVariables(templateBody);
  const validation = validateTemplate(templateBody, variableDefs);
  const preview = substituteVariables(templateBody, values);

  return Response.json({
    metadata,
    variables,
    variableDefinitions: variableDefs,
    validation,
    preview,
  });
}
