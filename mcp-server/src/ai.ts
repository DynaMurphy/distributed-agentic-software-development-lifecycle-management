import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY environment variable is required for AI-powered tools. " +
        "Set it in your environment or .env file."
      );
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

/**
 * Generate text using Claude. Used by AI-powered SPLM tools
 * (triage, duplicate detection, impact analysis, spec generation, etc.).
 *
 * Falls back gracefully if the API key is not configured — the caller
 * will receive a descriptive error.
 */
export async function generateAIText(params: {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const anthropic = getClient();
  const response = await anthropic.messages.create({
    model: params.model ?? "claude-haiku-4-5",
    max_tokens: params.maxTokens ?? 2048,
    system: params.system,
    messages: [{ role: "user", content: params.prompt }],
  });

  // Extract text from the response
  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}
