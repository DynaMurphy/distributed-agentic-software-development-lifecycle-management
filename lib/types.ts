import type { InferUITool, UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { createDocument } from "./ai/tools/create-document";
import type { getWeather } from "./ai/tools/get-weather";
import type { listSpecs } from "./ai/tools/spec-document";
import type { openSpec } from "./ai/tools/spec-document";
import type { updateSpec } from "./ai/tools/spec-document";
import type { editSpec } from "./ai/tools/spec-document";
import type { readSpec } from "./ai/tools/spec-document";
import type { requestSuggestions } from "./ai/tools/request-suggestions";
import type { updateDocument } from "./ai/tools/update-document";
import type {
  listFeatures,
  createFeature,
  updateFeature,
  getFeature,
} from "./ai/tools/feature-management";
import type {
  listBugsAI,
  createBugAI,
  updateBugAI,
  getBugAI,
} from "./ai/tools/bug-management";
import type {
  listTasksAI,
  createTaskAI,
  updateTaskAI,
} from "./ai/tools/task-management";
import type {
  viewBacklog,
  promoteToBacklogAI,
  triageItem,
  detectDuplicates,
  analyzeImpact,
} from "./ai/tools/backlog-management";
import type {
  linkDocumentAI,
  suggestDocumentLinks,
} from "./ai/tools/document-linking";
import type { generateSpecFromFeature } from "./ai/tools/generate-spec-from-feature";
import type { Suggestion } from "./db/schema";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type listSpecsTool = InferUITool<ReturnType<typeof listSpecs>>;
type openSpecTool = InferUITool<ReturnType<typeof openSpec>>;
type updateSpecTool = InferUITool<ReturnType<typeof updateSpec>>;
type editSpecTool = InferUITool<ReturnType<typeof editSpec>>;
type readSpecTool = InferUITool<ReturnType<typeof readSpec>>;

// SPLM tool types
type listFeaturesTool = InferUITool<ReturnType<typeof listFeatures>>;
type createFeatureTool = InferUITool<ReturnType<typeof createFeature>>;
type updateFeatureTool = InferUITool<ReturnType<typeof updateFeature>>;
type getFeatureTool = InferUITool<ReturnType<typeof getFeature>>;
type listBugsAITool = InferUITool<ReturnType<typeof listBugsAI>>;
type createBugAITool = InferUITool<ReturnType<typeof createBugAI>>;
type updateBugAITool = InferUITool<ReturnType<typeof updateBugAI>>;
type getBugAITool = InferUITool<ReturnType<typeof getBugAI>>;
type listTasksAITool = InferUITool<ReturnType<typeof listTasksAI>>;
type createTaskAITool = InferUITool<ReturnType<typeof createTaskAI>>;
type updateTaskAITool = InferUITool<ReturnType<typeof updateTaskAI>>;
type viewBacklogTool = InferUITool<ReturnType<typeof viewBacklog>>;
type promoteToBacklogAITool = InferUITool<ReturnType<typeof promoteToBacklogAI>>;
type triageItemTool = InferUITool<ReturnType<typeof triageItem>>;
type detectDuplicatesTool = InferUITool<ReturnType<typeof detectDuplicates>>;
type analyzeImpactTool = InferUITool<ReturnType<typeof analyzeImpact>>;
type linkDocumentAITool = InferUITool<ReturnType<typeof linkDocumentAI>>;
type suggestDocumentLinksTool = InferUITool<ReturnType<typeof suggestDocumentLinks>>;
type generateSpecFromFeatureTool = InferUITool<ReturnType<typeof generateSpecFromFeature>>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  listSpecs: listSpecsTool;
  openSpec: openSpecTool;
  updateSpec: updateSpecTool;
  editSpec: editSpecTool;
  readSpec: readSpecTool;
  // SPLM tools
  listFeatures: listFeaturesTool;
  createFeature: createFeatureTool;
  updateFeature: updateFeatureTool;
  getFeature: getFeatureTool;
  listBugs: listBugsAITool;
  createBug: createBugAITool;
  updateBug: updateBugAITool;
  getBug: getBugAITool;
  listTasks: listTasksAITool;
  createTask: createTaskAITool;
  updateTask: updateTaskAITool;
  viewBacklog: viewBacklogTool;
  promoteToBacklog: promoteToBacklogAITool;
  triageItem: triageItemTool;
  detectDuplicates: detectDuplicatesTool;
  analyzeImpact: analyzeImpactTool;
  linkDocument: linkDocumentAITool;
  suggestDocumentLinks: suggestDocumentLinksTool;
  generateSpecFromFeature: generateSpecFromFeatureTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  specDelta: string;
  featureDelta: string;
  bugDelta: string;
  taskDelta: string;
  backlogDelta: string;
  capabilityDelta: string;
  roadmapDelta: string;
  milestoneDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  "chat-title": string;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};
