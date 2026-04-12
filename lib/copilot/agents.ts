import type { CustomAgentConfig } from "@github/copilot-sdk";
import { resolveSkill, listAvailableTemplates, type ResolverConfig } from "@/lib/skills";

/**
 * Agent-to-skill mapping.
 * Each agent loads its corresponding SKILL.md for rich domain guidance.
 */
const AGENT_SKILL_MAP: Record<string, string> = {
  triage: "triage",
  "spec-writer": "spec-writing",
  implementer: "implementation",
  reviewer: "review",
};

/** Base prompts that are enhanced with resolved skill content. */
const BASE_PROMPTS: Record<string, string> = {
  triage: `You are the SPLM Triage Agent. Your role is to:
1. Assess incoming features and bugs for priority, effort, and risk.
2. Detect duplicate or overlapping items in the backlog.
3. Analyze impact of proposed changes on existing specs and features.
4. Recommend whether items should be promoted to the backlog.

You have read-only access to the codebase and SPLM analysis tools.
Be concise and data-driven in your assessments.`,

  "spec-writer": `You are the SPLM Spec Writer Agent. Your role is to:
1. Read and understand the codebase structure and existing specifications.
2. Generate comprehensive specification documents from feature descriptions.
3. Edit and refine existing specs based on feedback.
4. Ensure specs follow the project's established patterns and conventions.

You have read access to the codebase and full access to specification tools.
Write clear, structured specs with acceptance criteria and technical details.`,

  implementer: `You are the SPLM Implementer Agent. Your role is to:
1. Read and understand the codebase thoroughly.
2. Implement features and fix bugs according to their specifications.
3. Update SPLM item statuses as you progress through the workflow.
4. Create and update tasks to track implementation progress.

You have full access to all tools including file editing, shell commands, and SPLM management.
Follow the project's coding standards and conventions.`,

  reviewer: `You are the SPLM Reviewer Agent. Your role is to:
1. Review code changes for correctness, security, and adherence to project standards.
2. Review specifications for completeness and clarity.
3. Identify potential issues, edge cases, and improvements.
4. Provide constructive feedback with specific suggestions.

You have read-only access to the codebase and SPLM items.
Be thorough but constructive in your reviews.`,
};

/**
 * Build agent configs with resolved skill content injected into prompts.
 * Falls back to base prompts if skill resolution fails.
 */
export function buildSplmAgents(config: ResolverConfig): CustomAgentConfig[] {
  const templates = listAvailableTemplates(config);
  const templateSummary = templates.length > 0
    ? `\n\nAvailable templates:\n${templates.map((t) => `- ${t.category}/${t.name}: ${t.description || t.displayName}`).join("\n")}`
    : "";

  return Object.entries(BASE_PROMPTS).map(([name, basePrompt]) => {
    const skillName = AGENT_SKILL_MAP[name];
    const skill = skillName ? resolveSkill(skillName, config) : null;

    const enhancedPrompt = skill
      ? `${basePrompt}\n\n---\n\n## Skill Guide: ${skill.name}\n\n${skill.content}${templateSummary}`
      : `${basePrompt}${templateSummary}`;

    return {
      name,
      displayName: name === "spec-writer" ? "Spec Writer"
        : name === "triage" ? "Triage Agent"
        : name === "implementer" ? "Implementer"
        : "Reviewer",
      description: name === "triage"
        ? "Reads features/bugs and provides AI-powered triage, duplication detection, and impact analysis."
        : name === "spec-writer"
        ? "Reads the codebase and writes/edits specification documents for features and bugs."
        : name === "implementer"
        ? "Full access agent that reads code, writes code, and manages SPLM items through the entire lifecycle."
        : "Reviews code changes and specifications for correctness, consistency, and quality.",
      prompt: enhancedPrompt,
      tools: null,
    };
  });
}

/** Static agents for backward compat (no skill injection). */
export const splmAgents: CustomAgentConfig[] = Object.entries(BASE_PROMPTS).map(
  ([name, prompt]) => ({
    name,
    displayName: name === "spec-writer" ? "Spec Writer"
      : name === "triage" ? "Triage Agent"
      : name === "implementer" ? "Implementer"
      : "Reviewer",
    description: "",
    prompt,
    tools: null,
  }),
);

/**
 * Get an agent config by name.
 */
export function getSplmAgent(name: string): CustomAgentConfig | undefined {
  return splmAgents.find((a) => a.name === name);
}
