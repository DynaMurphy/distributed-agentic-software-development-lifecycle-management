import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  listBugs as listBugsDB,
  getBugById,
  createBug as createBugDB,
  updateBug as updateBugDB,
  promoteToBacklog,
} from "@/lib/db/bitemporal-work-items";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";

type BugToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: list bugs with optional filters.
 */
export const listBugsAI = ({ session, dataStream }: BugToolProps) =>
  tool({
    description:
      "List all bugs in the system. Can filter by status, priority, or severity. Returns bug titles, IDs, severity, status, and priority.",
    inputSchema: z.object({
      status: z
        .enum([
          "draft",
          "triage",
          "backlog",
          "spec_generation",
          "implementation",
          "testing",
          "done",
          "rejected",
        ])
        .optional()
        .describe("Filter by cascade status"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Filter by priority"),
      severity: z
        .enum(["blocker", "critical", "major", "minor", "trivial"])
        .optional()
        .describe("Filter by severity"),
    }),
    execute: async ({ status, priority, severity }) => {
      const bugs = await listBugsDB({ status, priority, severity });

      if (bugs.length === 0) {
        return {
          bugs: [],
          message: "No bugs found matching the criteria.",
        };
      }

      return {
        bugs: bugs.map((b) => ({
          id: b.id,
          title: b.title,
          severity: b.severity,
          status: b.status,
          priority: b.priority,
          lastModified: b.valid_from,
        })),
        message: `Found ${bugs.length} bug(s).`,
      };
    },
  });

/**
 * AI tool: get a specific bug with full details.
 */
export const getBugAI = ({ session, dataStream }: BugToolProps) =>
  tool({
    description:
      "Get full details of a specific bug by ID. Opens the bug in the artifact panel for viewing/editing.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the bug to open"),
    }),
    execute: async ({ id }) => {
      const bug = await getBugById(id);

      if (!bug) {
        return { error: "Bug not found." };
      }

      // Signal artifact panel to open with this bug
      dataStream.write({ type: "data-kind", data: "bug" as any, transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: bug.title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      dataStream.write({
        type: "data-bugDelta",
        data: JSON.stringify(bug),
        transient: true,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id: bug.id,
        title: bug.title,
        kind: "bug",
        content: `Bug "${bug.title}" has been opened in the editor. Severity: ${bug.severity}, Status: ${bug.status}.`,
      };
    },
  });

/**
 * AI tool: create a new bug. AI structures a bug report from natural language.
 */
export const createBugAI = ({ session, dataStream }: BugToolProps) =>
  tool({
    description:
      "Create a new bug report with structured details. AI should extract title, description, severity, steps to reproduce, expected/actual behavior from the user's report.",
    inputSchema: z.object({
      title: z
        .string()
        .describe("Clear, concise bug title (max 100 chars)"),
      description: z
        .string()
        .describe("Detailed bug description with context"),
      severity: z
        .enum(["blocker", "critical", "major", "minor", "trivial"])
        .default("major")
        .describe("Bug severity based on impact"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .default("medium")
        .describe("Fix priority"),
      stepsToReproduce: z
        .string()
        .optional()
        .describe("Step-by-step instructions to reproduce the bug"),
      expectedBehavior: z
        .string()
        .optional()
        .describe("What should happen"),
      actualBehavior: z
        .string()
        .optional()
        .describe("What actually happens"),
      environment: z
        .record(z.string())
        .optional()
        .describe(
          "Environment details (browser, OS, version, etc.)"
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization"),
    }),
    execute: async ({
      title,
      description,
      severity,
      priority,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      environment,
      tags,
    }) => {
      const id = generateUUID();
      const userId = session.user?.id;

      const versionId = await createBugDB({
        id,
        title,
        description,
        severity,
        priority,
        stepsToReproduce,
        expectedBehavior,
        actualBehavior,
        environment,
        createdBy: userId,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Auto-add to backlog so the bug appears on the kanban board
      await promoteToBacklog({
        id: generateUUID(),
        itemType: "bug",
        itemId: id,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      // Open the newly created bug in the artifact panel
      dataStream.write({ type: "data-kind", data: "bug" as any, transient: true });
      dataStream.write({ type: "data-id", data: id, transient: true });
      dataStream.write({ type: "data-title", data: title, transient: true });
      dataStream.write({ type: "data-clear", data: null, transient: true });

      const bugData = JSON.stringify({
        id,
        version_id: versionId,
        title,
        description,
        severity,
        status: "draft",
        priority,
        steps_to_reproduce: stepsToReproduce ?? null,
        expected_behavior: expectedBehavior ?? null,
        actual_behavior: actualBehavior ?? null,
        environment: environment ?? {},
        created_by: userId ?? null,
        assigned_to: null,
        tags: tags ?? [],
        ai_metadata: {},
      });

      dataStream.write({
        type: "data-bugDelta",
        data: bugData,
        transient: true,
      });

      dataStream.write({ type: "data-finish", data: null, transient: true });

      return {
        id,
        title,
        kind: "bug",
        content: `Bug "${title}" has been created with severity "${severity}" and priority "${priority}". It is now open in the editor for review.`,
      };
    },
  });

/**
 * AI tool: update an existing bug's fields.
 */
export const updateBugAI = ({ session, dataStream }: BugToolProps) =>
  tool({
    description:
      "Update an existing bug's fields such as title, description, severity, status, priority, or steps to reproduce. Only specified fields will be changed.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the bug to update"),
      title: z.string().optional().describe("Updated title"),
      description: z.string().optional().describe("Updated description"),
      severity: z
        .enum(["blocker", "critical", "major", "minor", "trivial"])
        .optional()
        .describe("Updated severity"),
      status: z
        .enum([
          "draft",
          "triage",
          "backlog",
          "spec_generation",
          "implementation",
          "testing",
          "done",
          "rejected",
        ])
        .optional()
        .describe("New cascade status"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Updated priority"),
      stepsToReproduce: z.string().optional(),
      expectedBehavior: z.string().optional(),
      actualBehavior: z.string().optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: async ({
      id,
      title,
      description,
      severity,
      status,
      priority,
      stepsToReproduce,
      expectedBehavior,
      actualBehavior,
      assignedTo,
      tags,
    }) => {
      const existing = await getBugById(id);
      if (!existing) {
        return { error: "Bug not found." };
      }

      await updateBugDB({
        id,
        title,
        description,
        severity,
        status,
        priority,
        stepsToReproduce,
        expectedBehavior,
        actualBehavior,
        assignedTo,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      const updated = await getBugById(id);
      if (updated) {
        dataStream.write({ type: "data-kind", data: "bug" as any, transient: true });
        dataStream.write({ type: "data-id", data: id, transient: true });
        dataStream.write({ type: "data-title", data: updated.title, transient: true });
        dataStream.write({ type: "data-clear", data: null, transient: true });
        dataStream.write({
          type: "data-bugDelta",
          data: JSON.stringify(updated),
          transient: true,
        });
        dataStream.write({ type: "data-finish", data: null, transient: true });
      }

      return {
        id,
        title: updated?.title ?? existing.title,
        kind: "bug",
        content: `Bug "${updated?.title ?? existing.title}" has been updated successfully.`,
      };
    },
  });
