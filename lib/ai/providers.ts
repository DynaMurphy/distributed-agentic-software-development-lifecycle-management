import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { xai } from "@ai-sdk/xai";
import {
  customProvider,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { isTestEnvironment } from "../constants";

const THINKING_SUFFIX_REGEX = /-thinking$/;

/**
 * Map provider/model IDs (e.g. "anthropic/claude-haiku-4.5") to
 * the correct direct provider SDK, bypassing Vercel AI Gateway.
 */
function resolveDirectModel(modelId: string) {
  const [provider, ...rest] = modelId.split("/");
  const model = rest.join("/");

  switch (provider) {
    case "anthropic":
      return anthropic(model);
    case "google":
      return google(model);
    case "openai":
      return openai(model);
    case "xai":
      return xai(model);
    default:
      throw new Error(`Unknown AI provider: ${provider}. Supported: anthropic, google, openai, xai`);
  }
}

export const myProvider = isTestEnvironment
  ? (() => {
      const {
        artifactModel,
        chatModel,
        reasoningModel,
        titleModel,
      } = require("./models.mock");
      return customProvider({
        languageModels: {
          "chat-model": chatModel,
          "chat-model-reasoning": reasoningModel,
          "title-model": titleModel,
          "artifact-model": artifactModel,
        },
      });
    })()
  : null;

export function getLanguageModel(modelId: string) {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel(modelId);
  }

  const isReasoningModel =
    modelId.includes("reasoning") || modelId.endsWith("-thinking");

  if (isReasoningModel) {
    const directModelId = modelId.replace(THINKING_SUFFIX_REGEX, "");

    return wrapLanguageModel({
      model: resolveDirectModel(directModelId),
      middleware: extractReasoningMiddleware({ tagName: "thinking" }),
    });
  }

  return resolveDirectModel(modelId);
}

export function getTitleModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("title-model");
  }
  return resolveDirectModel("google/gemini-2.5-flash-lite");
}

export function getArtifactModel() {
  if (isTestEnvironment && myProvider) {
    return myProvider.languageModel("artifact-model");
  }
  return resolveDirectModel("anthropic/claude-haiku-4-5");
}
