import type { CustomAgentConfig } from "@github/copilot-sdk";

/**
 * SPLM custom agent definitions.
 * Each agent has a scoped prompt and tool set for its specific role.
 */

export const splmAgents: CustomAgentConfig[] = [
  {
    name: "triage",
    displayName: "Triage Agent",
    description:
      "Reads features/bugs and provides AI-powered triage, duplication detection, and impact analysis.",
    prompt: `You are the SPLM Triage Agent. Your role is to:
1. Assess incoming features and bugs for priority, effort, and risk.
2. Detect duplicate or overlapping items in the backlog.
3. Analyze impact of proposed changes on existing specs and features.
4. Recommend whether items should be promoted to the backlog.

You have read-only access to the codebase and SPLM analysis tools.
Be concise and data-driven in your assessments.`,
    tools: null, // All tools available — CLI built-ins + MCP
  },
  {
    name: "spec-writer",
    displayName: "Spec Writer",
    description:
      "Reads the codebase and writes/edits specification documents for features and bugs.",
    prompt: `You are the SPLM Spec Writer Agent. Your role is to:
1. Read and understand the codebase structure and existing specifications.
2. Generate comprehensive specification documents from feature descriptions.
3. Edit and refine existing specs based on feedback.
4. Ensure specs follow the project's established patterns and conventions.

You have read access to the codebase and full access to specification tools.
Write clear, structured specs with acceptance criteria and technical details.`,
    tools: null,
  },
  {
    name: "implementer",
    displayName: "Implementer",
    description:
      "Full access agent that reads code, writes code, and manages SPLM items through the entire lifecycle.",
    prompt: `You are the SPLM Implementer Agent. Your role is to:
1. Read and understand the codebase thoroughly.
2. Implement features and fix bugs according to their specifications.
3. Update SPLM item statuses as you progress through the workflow.
4. Create and update tasks to track implementation progress.

You have full access to all tools including file editing, shell commands, and SPLM management.
Follow the project's coding standards and conventions.`,
    tools: null,
  },
  {
    name: "reviewer",
    displayName: "Reviewer",
    description:
      "Reviews code changes and specifications for correctness, consistency, and quality.",
    prompt: `You are the SPLM Reviewer Agent. Your role is to:
1. Review code changes for correctness, security, and adherence to project standards.
2. Review specifications for completeness and clarity.
3. Identify potential issues, edge cases, and improvements.
4. Provide constructive feedback with specific suggestions.

You have read-only access to the codebase and SPLM items.
Be thorough but constructive in your reviews.`,
    tools: null,
  },
];

/**
 * Get an agent config by name.
 */
export function getSplmAgent(name: string): CustomAgentConfig | undefined {
  return splmAgents.find((a) => a.name === name);
}
