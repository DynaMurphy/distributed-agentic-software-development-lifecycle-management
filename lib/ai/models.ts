// Curated list of top models from Vercel AI Gateway
export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash-lite";

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
};

export const chatModels: ChatModel[] = [
  // Anthropic
  {
    id: "anthropic/claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    provider: "anthropic",
    description: "Fast and affordable, great for everyday tasks",
  },
  {
    id: "anthropic/claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    description: "Best balance of speed, intelligence, and cost",
  },
  {
    id: "anthropic/claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "anthropic",
    description: "Most capable Anthropic model",
  },
  // OpenAI
  {
    id: "openai/gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast and affordable, great for everyday tasks",
  },
  {
    id: "openai/gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    description: "Flagship OpenAI model, excellent at coding and instruction following",
  },
  {
    id: "openai/o3-mini",
    name: "o3-mini",
    provider: "openai",
    description: "Fast reasoning model optimized for STEM and code",
  },
  // Google
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "google",
    description: "Ultra fast and affordable",
  },
  {
    id: "google/gemini-3-pro-preview",
    name: "Gemini 3 Pro",
    provider: "google",
    description: "Most capable Google model",
  },
  // xAI
  {
    id: "xai/grok-4.1-fast-non-reasoning",
    name: "Grok 4.1 Fast",
    provider: "xai",
    description: "Fast with 30K context",
  },
  // Reasoning models (extended thinking)
  {
    id: "anthropic/claude-3-7-sonnet-thinking",
    name: "Claude 3.7 Sonnet",
    provider: "reasoning",
    description: "Extended thinking for complex problems",
  },
  {
    id: "xai/grok-code-fast-1-thinking",
    name: "Grok Code Fast",
    provider: "reasoning",
    description: "Reasoning optimized for code",
  },
];

// Copilot Pro+ models — available when USE_COPILOT_SDK is enabled
export const copilotModels: ChatModel[] = [
  {
    id: "copilot/claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "copilot",
    description: "Most capable Anthropic model via Copilot Pro+",
  },
  {
    id: "copilot/claude-opus-4",
    name: "Claude Opus 4",
    provider: "copilot",
    description: "Powerful Anthropic model via Copilot Pro+",
  },
  {
    id: "copilot/claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "copilot",
    description: "Fast and capable via Copilot Pro+",
  },
  {
    id: "copilot/gpt-4.1",
    name: "GPT-4.1",
    provider: "copilot",
    description: "OpenAI flagship via Copilot Pro+",
  },
  {
    id: "copilot/o3-pro",
    name: "o3 Pro",
    provider: "copilot",
    description: "Advanced reasoning via Copilot Pro+",
  },
  {
    id: "copilot/gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "copilot",
    description: "Google flagship via Copilot Pro+",
  },
];

/**
 * Get all available models, optionally including Copilot Pro+ models.
 */
export function getAllModels(includeCopilot = false): ChatModel[] {
  return includeCopilot ? [...chatModels, ...copilotModels] : chatModels;
}

// Group models by provider for UI
export const modelsByProvider = chatModels.reduce(
  (acc, model) => {
    if (!acc[model.provider]) {
      acc[model.provider] = [];
    }
    acc[model.provider].push(model);
    return acc;
  },
  {} as Record<string, ChatModel[]>
);

/**
 * Group models by provider, optionally including Copilot models.
 */
export function getModelsByProvider(includeCopilot = false): Record<string, ChatModel[]> {
  const models = getAllModels(includeCopilot);
  return models.reduce(
    (acc, model) => {
      if (!acc[model.provider]) {
        acc[model.provider] = [];
      }
      acc[model.provider].push(model);
      return acc;
    },
    {} as Record<string, ChatModel[]>
  );
}
