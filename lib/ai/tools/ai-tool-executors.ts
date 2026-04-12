import "server-only";

import { generateText } from "ai";
import { getLanguageModel } from "@/lib/ai/providers";
import {
  getFeatureById,
  getBugById,
  getTaskById,
  getSubFeatures,
  listFeatures as listFeaturesDB,
  listBugs as listBugsDB,
  listTasks,
  updateFeature as updateFeatureDB,
  updateBug as updateBugDB,
  createTask as createTaskDB,
  getDocumentLinksWithTitles,
  getDocumentsForItem,
  linkDocumentToItem,
  type ItemType,
  type LinkType,
} from "@/lib/db/bitemporal-work-items";
import {
  listBitemporalDocuments,
  createBitemporalDocument,
} from "@/lib/db/bitemporal-queries";
import { getBacklog } from "@/lib/db/bitemporal-work-items";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";
import { generateUUID } from "@/lib/utils";

// =============================================================================
// Shared types for AI tool results
// =============================================================================

export interface TriageResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  triage: {
    suggestedPriority?: string;
    suggestedEffort?: string;
    rationale?: string;
    riskLevel?: string;
    suggestedSprint?: string;
    rawAssessment?: string;
    triagedAt: string;
  };
}

export interface DuplicateCandidate {
  id: string;
  title: string;
  similarityScore: number;
  reason: string;
}

export interface DuplicateResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  duplicates: DuplicateCandidate[];
  checkedAt: string;
}

export interface ImpactResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  impact: {
    impactedSpecs?: Array<{
      specId: string;
      specTitle: string;
      impactLevel: string;
      description: string;
    }>;
    impactedBacklogItems?: Array<{
      itemId: string;
      itemTitle: string;
      relationship: string;
      description: string;
    }>;
    overallRisk?: string;
    summary?: string;
    recommendations?: string[];
    rawAnalysis?: string;
    analyzedAt: string;
  };
}

export interface DocumentSuggestion {
  id: string;
  title: string;
  relevanceScore: number;
  suggestedLinkType: string;
  reason: string;
}

export interface SuggestLinksResult {
  itemType: string;
  itemId: string;
  title: string;
  suggestions: DocumentSuggestion[];
  existingLinks: Array<{
    linkId: string;
    documentId: string;
    linkType: string;
  }>;
}

// =============================================================================
// New composite AI action result types
// =============================================================================

export interface GenerateSpecResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  specId: string;
  specTitle: string;
  linkId: string;
}

export interface AIDesignResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  duplicateCheck: DuplicateResult["duplicates"];
  suggestedLinks: DocumentSuggestion[];
  acceptedLinks: string[];
  specGenerated: boolean;
  specId?: string;
  specTitle?: string;
  completedAt: string;
}

export interface ImplementationTask {
  title: string;
  description: string;
  estimatedEffort: string;
}

export interface AIImplementResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  impact: ImpactResult["impact"];
  implementationPlan: {
    tasks: ImplementationTask[];
    createdTaskIds: string[];
    approach: string;
    analyzedAt: string;
  };
}

export interface TestScenario {
  name: string;
  description: string;
  type: "unit" | "integration" | "e2e" | "manual";
  steps: string[];
}

export interface AITestingResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  testPlan: {
    scenarios: TestScenario[];
    acceptanceCriteria: string[];
    edgeCases: string[];
    generatedAt: string;
  };
}

export interface AISignoffResult {
  itemType: "feature" | "bug";
  itemId: string;
  title: string;
  signoff: {
    verdict: "approved" | "needs_work";
    summary: string;
    completedItems: string[];
    remainingRisks: string[];
    signedOffAt: string;
  };
}

// =============================================================================
// Executor: Triage
// =============================================================================

export async function executeTriageItem(
  itemType: "feature" | "bug",
  itemId: string
): Promise<TriageResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const triageResult = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior product manager performing triage on software ${itemType}s. Analyze the following ${itemType} and provide a JSON assessment with these fields:
- suggestedPriority: "critical" | "high" | "medium" | "low"
- suggestedEffort: "S" | "M" | "L" | "XL"
- rationale: A brief explanation of your assessment (2-3 sentences)
- riskLevel: "high" | "medium" | "low"
- suggestedSprint: A suggestion for when to schedule this (e.g., "next sprint", "backlog", "urgent - current sprint")
Output ONLY valid JSON.`,
    prompt: `Title: ${item.title}\nDescription: ${item.description ?? "No description"}\nCurrent Priority: ${item.priority}\nStatus: ${item.status}${
      itemType === "bug" && "severity" in item
        ? `\nSeverity: ${(item as any).severity}\nSteps to Reproduce: ${(item as any).steps_to_reproduce ?? "Not provided"}\nExpected Behavior: ${(item as any).expected_behavior ?? "Not provided"}\nActual Behavior: ${(item as any).actual_behavior ?? "Not provided"}`
        : ""
    }`,
  });

  let triageData: Record<string, unknown> = {};
  try {
    triageData = JSON.parse(triageResult.text);
  } catch {
    triageData = { rawAssessment: triageResult.text };
  }

  const now = new Date().toISOString();
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    triage: {
      ...triageData,
      triagedAt: now,
    },
  };

  // Auto-apply suggested priority to the actual field
  const validPriorities = ["critical", "high", "medium", "low"];
  const appliedPriority = validPriorities.includes(triageData.suggestedPriority as string)
    ? (triageData.suggestedPriority as string)
    : undefined;
  const appliedEffort = typeof triageData.suggestedEffort === "string"
    ? triageData.suggestedEffort
    : undefined;

  if (itemType === "feature") {
    await updateFeatureDB({
      id: itemId,
      status: "triage",
      aiMetadata,
      ...(appliedPriority ? { priority: appliedPriority as any } : {}),
      ...(appliedEffort ? { effortEstimate: appliedEffort } : {}),
    });
  } else {
    await updateBugDB({
      id: itemId,
      status: "triage",
      aiMetadata,
      ...(appliedPriority ? { priority: appliedPriority as any } : {}),
    });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    triage: { ...triageData, triagedAt: now } as TriageResult["triage"],
  };
}

// =============================================================================
// Executor: Detect Duplicates
// =============================================================================

export async function executeDetectDuplicates(
  itemType: "feature" | "bug",
  itemId: string
): Promise<DuplicateResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const allItems =
    itemType === "feature" ? await listFeaturesDB() : await listBugsDB();
  const otherItems = allItems.filter((i) => i.id !== itemId);

  if (otherItems.length === 0) {
    return {
      itemType,
      itemId,
      title: item.title,
      duplicates: [],
      checkedAt: new Date().toISOString(),
    };
  }

  const result = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are analyzing ${itemType}s for potential duplicates. Compare the target item against the list of existing items and identify any that might be duplicates or very similar. Return a JSON array of objects with fields: id, title, similarityScore (0-100), reason. Only include items with similarityScore >= 40. Output ONLY valid JSON array.`,
    prompt: `Target ${itemType}:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nExisting ${itemType}s:\n${otherItems.map((i) => `- ID: ${i.id}, Title: ${i.title}`).join("\n")}`,
  });

  let duplicates: DuplicateCandidate[] = [];
  try {
    duplicates = JSON.parse(result.text);
  } catch {
    duplicates = [];
  }

  const now = new Date().toISOString();
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    duplicateCheck: {
      candidates: duplicates,
      checkedAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    duplicates,
    checkedAt: now,
  };
}

// =============================================================================
// Executor: Analyze Impact
// =============================================================================

export async function executeAnalyzeImpact(
  itemType: "feature" | "bug",
  itemId: string
): Promise<ImpactResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);
  const allSpecs = await listBitemporalDocuments();
  const backlog = await getBacklog();

  const result = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior technical analyst performing impact analysis. Analyze the ${itemType} and evaluate its potential impact on existing specifications and backlog items. Return a JSON object with:
- impactedSpecs: array of { specId, specTitle, impactLevel: "high"|"medium"|"low", description }
- impactedBacklogItems: array of { itemId, itemTitle, relationship: "blocks"|"blocked_by"|"related", description }
- overallRisk: "high"|"medium"|"low"
- summary: brief impact summary (2-3 sentences)
- recommendations: array of action items
Output ONLY valid JSON.`,
    prompt: `${itemType.toUpperCase()}:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\nPriority: ${item.priority}\nStatus: ${item.status}\n\nLinked Documents:\n${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}\n\nAll Specifications:\n${allSpecs.map((s) => `- ID: ${s.id}, Title: ${s.title}`).join("\n") || "None"}\n\nCurrent Backlog:\n${backlog.map((b) => `- ${b.item_title} (${b.item_type}, rank #${b.rank})`).join("\n") || "Empty"}`,
  });

  let impactData: Record<string, unknown> = {};
  try {
    impactData = JSON.parse(result.text);
  } catch {
    impactData = { rawAnalysis: result.text };
  }

  const now = new Date().toISOString();
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    impactAnalysis: {
      ...impactData,
      analyzedAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    impact: { ...impactData, analyzedAt: now } as ImpactResult["impact"],
  };
}

// =============================================================================
// Executor: Suggest Document Links
// =============================================================================

export async function executeSuggestDocumentLinks(
  itemType: "feature" | "bug" | "task",
  itemId: string
): Promise<SuggestLinksResult | { error: string }> {
  let item: { title: string; description: string | null; ai_metadata?: Record<string, unknown> } | null = null;

  if (itemType === "feature") {
    item = await getFeatureById(itemId);
  } else if (itemType === "bug") {
    item = await getBugById(itemId);
  } else if (itemType === "task") {
    item = await getTaskById(itemId);
  }

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const allSpecs = await listBitemporalDocuments();
  const existingLinks = await getDocumentsForItem(
    itemType as ItemType,
    itemId
  );
  const linkedDocIds = new Set(existingLinks.map((l) => l.document_id));
  const unlinkedSpecs = allSpecs.filter((s) => !linkedDocIds.has(s.id));

  if (unlinkedSpecs.length === 0) {
    return {
      itemType,
      itemId,
      title: item.title,
      suggestions: [],
      existingLinks: existingLinks.map((l) => ({
        linkId: l.id,
        documentId: l.document_id,
        linkType: l.link_type,
      })),
    };
  }

  const result = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are analyzing the relevance of specification documents to a work item. Score each document's relevance (0-100) and suggest an appropriate link type. Return a JSON array of objects with: id, title, relevanceScore (0-100), suggestedLinkType ("specification"|"test_plan"|"design"|"reference"), reason. Only include items with relevanceScore >= 30. Sort by relevanceScore descending. Output ONLY valid JSON array.`,
    prompt: `Work Item (${itemType}):\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nAvailable Specification Documents:\n${unlinkedSpecs.map((s) => `- ID: ${s.id}, Title: ${s.title}`).join("\n")}`,
  });

  let suggestions: DocumentSuggestion[] = [];
  try {
    suggestions = JSON.parse(result.text);
  } catch {
    suggestions = [];
  }

  // Store suggestions in ai_metadata for persistence
  if (itemType === "feature" || itemType === "bug") {
    const aiMetadata = {
      ...(item.ai_metadata || {}),
      suggestedLinks: {
        suggestions,
        suggestedAt: new Date().toISOString(),
      },
    };

    if (itemType === "feature") {
      await updateFeatureDB({ id: itemId, aiMetadata });
    } else {
      await updateBugDB({ id: itemId, aiMetadata });
    }
  }

  return {
    itemType,
    itemId,
    title: item.title,
    suggestions,
    existingLinks: existingLinks.map((l) => ({
      linkId: l.id,
      documentId: l.document_id,
      linkType: l.link_type,
    })),
  };
}

// =============================================================================
// Executor: Accept a document link suggestion
// =============================================================================

export async function executeAcceptSuggestion(
  itemType: "feature" | "bug" | "task",
  itemId: string,
  documentId: string,
  linkType: string
): Promise<{ linkId: string } | { error: string }> {
  const linkId = generateUUID();
  try {
    await linkDocumentToItem({
      id: linkId,
      itemType: itemType as ItemType,
      itemId,
      documentId,
      linkType: linkType as LinkType,
    });
    return { linkId };
  } catch (err) {
    return { error: `Failed to link document: ${String(err)}` };
  }
}

// =============================================================================
// Executor: Generate Spec (standalone, no streaming dataStream)
// =============================================================================

export async function executeGenerateSpec(
  itemType: "feature" | "bug",
  itemId: string
): Promise<GenerateSpecResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  // Gather related data
  const subFeatures =
    itemType === "feature" ? await getSubFeatures(itemId) : [];
  const tasks = await listTasks({ parentType: itemType, parentId: itemId });
  const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);

  const context = [
    `# ${itemType === "feature" ? "Feature" : "Bug"}: ${item.title}`,
    `Priority: ${item.priority} | Status: ${item.status}`,
    item.description ? `\n## Description\n${item.description}` : "",
    subFeatures.length > 0
      ? `\n## Sub-Features\n${subFeatures.map((sf) => `- ${sf.title} (${sf.status})`).join("\n")}`
      : "",
    tasks.length > 0
      ? `\n## Tasks\n${tasks.map((t) => `- ${t.title} (${t.status})`).join("\n")}`
      : "",
    linkedDocs.length > 0
      ? `\n## Existing Linked Documents\n${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n")}`
      : "",
    itemType === "bug" && "severity" in item
      ? `\n## Bug Details\nSeverity: ${(item as any).severity}\nSteps: ${(item as any).steps_to_reproduce ?? "N/A"}\nExpected: ${(item as any).expected_behavior ?? "N/A"}\nActual: ${(item as any).actual_behavior ?? "N/A"}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const specTitle = `Specification: ${item.title}`;

  // Generate spec content via AI
  const specResult = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior technical writer. Generate a comprehensive specification document in Markdown for the following ${itemType}. Include sections for: Overview, Requirements, Technical Design, Acceptance Criteria, Dependencies, and Risks. Be thorough and specific based on the provided context.`,
    prompt: context,
  });

  // Create the document
  const docId = generateUUID();
  await createBitemporalDocument(
    docId,
    specTitle,
    specResult.text,
    CHAT_ASSISTANT_USER_ID
  );

  // Link to the item
  const linkId = generateUUID();
  await linkDocumentToItem({
    id: linkId,
    itemType: itemType as ItemType,
    itemId,
    documentId: docId,
    linkType: "specification" as LinkType,
    maintainedBy: CHAT_ASSISTANT_USER_ID,
  });

  // Store in ai_metadata
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    specGeneration: {
      specId: docId,
      specTitle,
      linkId,
      generatedAt: new Date().toISOString(),
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    specId: docId,
    specTitle,
    linkId,
  };
}

// =============================================================================
// Executor: AI Design (composite: duplicates + links + spec)
// =============================================================================

export async function executeAIDesign(
  itemType: "feature" | "bug",
  itemId: string
): Promise<AIDesignResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  // Step 1: Detect duplicates
  const dupResult = await executeDetectDuplicates(itemType, itemId);
  const duplicates = "error" in dupResult ? [] : dupResult.duplicates;

  // Step 2: Suggest and auto-accept high-confidence document links
  const linkResult = await executeSuggestDocumentLinks(itemType, itemId);
  const suggestions = "error" in linkResult ? [] : linkResult.suggestions;

  const acceptedLinks: string[] = [];
  for (const suggestion of suggestions) {
    if (suggestion.relevanceScore >= 70) {
      const acceptResult = await executeAcceptSuggestion(
        itemType,
        itemId,
        suggestion.id,
        suggestion.suggestedLinkType
      );
      if (!("error" in acceptResult)) {
        acceptedLinks.push(acceptResult.linkId);
      }
    }
  }

  // Step 3: Generate spec
  const specResult = await executeGenerateSpec(itemType, itemId);
  const specGenerated = !("error" in specResult);

  // Store composite result in ai_metadata
  const now = new Date().toISOString();
  const freshItem =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  const aiMetadata = {
    ...(freshItem?.ai_metadata || {}),
    designPhase: {
      duplicatesFound: duplicates.length,
      linksAccepted: acceptedLinks.length,
      specGenerated,
      specId: specGenerated && !("error" in specResult) ? specResult.specId : null,
      completedAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    duplicateCheck: duplicates,
    suggestedLinks: suggestions,
    acceptedLinks,
    specGenerated,
    specId: specGenerated && !("error" in specResult) ? specResult.specId : undefined,
    specTitle: specGenerated && !("error" in specResult) ? specResult.specTitle : undefined,
    completedAt: now,
  };
}

// =============================================================================
// Executor: AI Implement (impact analysis + task breakdown)
// =============================================================================

export async function executeAIImplement(
  itemType: "feature" | "bug",
  itemId: string
): Promise<AIImplementResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  // Step 1: Analyze impact
  const impactResult = await executeAnalyzeImpact(itemType, itemId);
  const impact = "error" in impactResult ? { analyzedAt: new Date().toISOString() } as ImpactResult["impact"] : impactResult.impact;

  // Step 2: Gather context for task breakdown
  const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);
  const existingTasks = await listTasks({ parentType: itemType, parentId: itemId });

  const taskBreakdownResult = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior software architect. Based on the ${itemType} details, its impact analysis, and linked specifications, create an implementation task breakdown. Return a JSON object with:
- approach: A 2-3 sentence overview of the implementation strategy
- tasks: Array of { title: string, description: string, estimatedEffort: "S"|"M"|"L"|"XL" }
Include 3-8 tasks that cover the full implementation scope. If there are existing tasks listed, avoid duplicating them. Output ONLY valid JSON.`,
    prompt: `${itemType.toUpperCase()}: ${item.title}
Description: ${item.description ?? "No description"}
Priority: ${item.priority}

Impact Analysis: ${JSON.stringify(impact)}

Linked Specs: ${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}

Existing Tasks: ${existingTasks.map((t) => `- ${t.title} (${t.status})`).join("\n") || "None"}`,
  });

  let taskData: { approach?: string; tasks?: ImplementationTask[] } = {};
  try {
    taskData = JSON.parse(taskBreakdownResult.text);
  } catch {
    taskData = { approach: taskBreakdownResult.text, tasks: [] };
  }

  const generatedTasks = taskData.tasks ?? [];

  // Step 3: Create task entities in the DB
  const createdTaskIds: string[] = [];
  for (const task of generatedTasks) {
    const taskId = generateUUID();
    try {
      await createTaskDB({
        id: taskId,
        title: task.title,
        description: task.description,
        parentType: itemType,
        parentId: itemId,
        status: "todo",
        priority: item.priority as any,
        effortEstimate: task.estimatedEffort,
      });
      createdTaskIds.push(taskId);
    } catch {
      // Skip failed task creation, continue with others
    }
  }

  // Store in ai_metadata
  const now = new Date().toISOString();
  const freshItem =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  const aiMetadata = {
    ...(freshItem?.ai_metadata || {}),
    implementationPlan: {
      approach: taskData.approach ?? "",
      tasks: generatedTasks,
      createdTaskIds,
      analyzedAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    impact,
    implementationPlan: {
      tasks: generatedTasks,
      createdTaskIds,
      approach: taskData.approach ?? "",
      analyzedAt: now,
    },
  };
}

// =============================================================================
// Executor: AI Testing (test plan generation)
// =============================================================================

export async function executeAITesting(
  itemType: "feature" | "bug",
  itemId: string
): Promise<AITestingResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);
  const tasks = await listTasks({ parentType: itemType, parentId: itemId });

  const testResult = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior QA engineer. Based on the ${itemType}, its specifications, and implementation tasks, create a comprehensive test plan. Return a JSON object with:
- scenarios: Array of { name: string, description: string, type: "unit"|"integration"|"e2e"|"manual", steps: string[] }
- acceptanceCriteria: Array of strings — clear, testable criteria that must pass
- edgeCases: Array of strings — edge cases and boundary conditions to test
Include 3-8 test scenarios covering happy paths, error paths, and edge cases. Output ONLY valid JSON.`,
    prompt: `${itemType.toUpperCase()}: ${item.title}
Description: ${item.description ?? "No description"}
Priority: ${item.priority}

Linked Specs: ${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}

Implementation Tasks: ${tasks.map((t) => `- ${t.title} (${t.status})`).join("\n") || "None"}

${itemType === "bug" && "severity" in item ? `Bug Details:
Severity: ${(item as any).severity}
Steps to Reproduce: ${(item as any).steps_to_reproduce ?? "N/A"}
Expected: ${(item as any).expected_behavior ?? "N/A"}
Actual: ${(item as any).actual_behavior ?? "N/A"}` : ""}`,
  });

  let testData: { scenarios?: TestScenario[]; acceptanceCriteria?: string[]; edgeCases?: string[] } = {};
  try {
    testData = JSON.parse(testResult.text);
  } catch {
    testData = { scenarios: [], acceptanceCriteria: [], edgeCases: [] };
  }

  const now = new Date().toISOString();
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    testPlan: {
      scenarios: testData.scenarios ?? [],
      acceptanceCriteria: testData.acceptanceCriteria ?? [],
      edgeCases: testData.edgeCases ?? [],
      generatedAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    testPlan: {
      scenarios: testData.scenarios ?? [],
      acceptanceCriteria: testData.acceptanceCriteria ?? [],
      edgeCases: testData.edgeCases ?? [],
      generatedAt: now,
    },
  };
}

// =============================================================================
// Executor: AI Signoff (completeness verification)
// =============================================================================

export async function executeAISignoff(
  itemType: "feature" | "bug",
  itemId: string
): Promise<AISignoffResult | { error: string }> {
  const item =
    itemType === "feature"
      ? await getFeatureById(itemId)
      : await getBugById(itemId);

  if (!item) {
    return { error: `${itemType} not found.` };
  }

  const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);
  const tasks = await listTasks({ parentType: itemType, parentId: itemId });

  // Build full context including all AI metadata
  const aiMeta = (item.ai_metadata || {}) as Record<string, any>;

  const signoffResult = await generateText({
    model: getLanguageModel("anthropic/claude-haiku-4-5"),
    system: `You are a senior engineering manager performing a final signoff review. Assess whether the ${itemType} is complete and ready to be marked as done. Consider the specifications, implementation tasks (all should be done), test plan, and any remaining risks. Return a JSON object with:
- verdict: "approved" | "needs_work" — "approved" only if all critical items are addressed
- summary: A 2-3 sentence overall assessment
- completedItems: Array of strings listing what has been accomplished
- remainingRisks: Array of strings listing any outstanding concerns or blockers
Output ONLY valid JSON.`,
    prompt: `${itemType.toUpperCase()}: ${item.title}
Description: ${item.description ?? "No description"}
Priority: ${item.priority}

Linked Documents: ${linkedDocs.map((d) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}

Tasks: ${tasks.map((t) => `- ${t.title} — Status: ${t.status}`).join("\n") || "None"}

AI Triage Data: ${aiMeta.triage ? JSON.stringify(aiMeta.triage) : "Not triaged"}
Impact Analysis: ${aiMeta.impactAnalysis ? JSON.stringify(aiMeta.impactAnalysis) : "Not analyzed"}
Test Plan: ${aiMeta.testPlan ? `${(aiMeta.testPlan.scenarios?.length ?? 0)} scenarios, ${(aiMeta.testPlan.acceptanceCriteria?.length ?? 0)} acceptance criteria` : "No test plan"}
Implementation Plan: ${aiMeta.implementationPlan ? `${(aiMeta.implementationPlan.tasks?.length ?? 0)} tasks planned` : "No implementation plan"}`,
  });

  let signoffData: { verdict?: string; summary?: string; completedItems?: string[]; remainingRisks?: string[] } = {};
  try {
    signoffData = JSON.parse(signoffResult.text);
  } catch {
    signoffData = { verdict: "needs_work", summary: signoffResult.text, completedItems: [], remainingRisks: ["Could not parse AI response"] };
  }

  const now = new Date().toISOString();
  const aiMetadata = {
    ...(item.ai_metadata || {}),
    signoff: {
      verdict: signoffData.verdict ?? "needs_work",
      summary: signoffData.summary ?? "",
      completedItems: signoffData.completedItems ?? [],
      remainingRisks: signoffData.remainingRisks ?? [],
      signedOffAt: now,
    },
  };

  if (itemType === "feature") {
    await updateFeatureDB({ id: itemId, aiMetadata });
  } else {
    await updateBugDB({ id: itemId, aiMetadata });
  }

  return {
    itemType,
    itemId,
    title: item.title,
    signoff: {
      verdict: (signoffData.verdict ?? "needs_work") as "approved" | "needs_work",
      summary: signoffData.summary ?? "",
      completedItems: signoffData.completedItems ?? [],
      remainingRisks: signoffData.remainingRisks ?? [],
      signedOffAt: now,
    },
  };
}
