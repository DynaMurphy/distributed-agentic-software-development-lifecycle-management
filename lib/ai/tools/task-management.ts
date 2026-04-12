import { tool, type UIMessageStreamWriter } from "ai";
import type { Session } from "next-auth";
import { z } from "zod";
import {
  listTasks as listTasksDB,
  getTaskById,
  createTask as createTaskDB,
  updateTask as updateTaskDB,
} from "@/lib/db/bitemporal-work-items";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
import { CHAT_ASSISTANT_USER_ID } from "@/lib/constants";

type TaskToolProps = {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
};

/**
 * AI tool: list tasks with optional filters.
 */
export const listTasksAI = ({ session, dataStream }: TaskToolProps) =>
  tool({
    description:
      "List tasks, optionally filtered by parent feature/bug or status. Returns task titles, IDs, status, and parent info.",
    inputSchema: z.object({
      parentType: z
        .enum(["feature", "bug"])
        .optional()
        .describe("Filter by parent item type"),
      parentId: z
        .string()
        .optional()
        .describe("Filter by parent item ID"),
      status: z
        .enum(["todo", "in_progress", "done", "blocked"])
        .optional()
        .describe("Filter by task status"),
    }),
    execute: async ({ parentType, parentId, status }) => {
      const tasks = await listTasksDB({ parentType, parentId, status });

      if (tasks.length === 0) {
        return {
          tasks: [],
          message: "No tasks found matching the criteria.",
        };
      }

      return {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          parentType: t.parent_type,
          parentId: t.parent_id,
          status: t.status,
          priority: t.priority,
          lastModified: t.valid_from,
        })),
        message: `Found ${tasks.length} task(s).`,
      };
    },
  });

/**
 * AI tool: create a new task under a feature or bug.
 */
export const createTaskAI = ({ session, dataStream }: TaskToolProps) =>
  tool({
    description:
      "Create a new task as a breakdown of a feature or bug. AI should generate clear, actionable task titles and descriptions.",
    inputSchema: z.object({
      title: z
        .string()
        .describe("Clear, actionable task title"),
      description: z
        .string()
        .optional()
        .describe("Task description with implementation details"),
      parentType: z
        .enum(["feature", "bug"])
        .describe("Whether this task belongs to a feature or bug"),
      parentId: z
        .string()
        .describe("The UUID of the parent feature or bug"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .default("medium")
        .describe("Task priority"),
      effortEstimate: z
        .string()
        .optional()
        .describe("Effort estimate (S, M, L, XL)"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Tags for categorization"),
    }),
    execute: async ({
      title,
      description,
      parentType,
      parentId,
      priority,
      effortEstimate,
      tags,
    }) => {
      const id = generateUUID();

      await createTaskDB({
        id,
        title,
        description,
        parentType,
        parentId,
        priority,
        effortEstimate,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      return {
        id,
        title,
        parentType,
        parentId,
        content: `Task "${title}" has been created under ${parentType} ${parentId}.`,
      };
    },
  });

/**
 * AI tool: update an existing task's fields.
 */
export const updateTaskAI = ({ session, dataStream }: TaskToolProps) =>
  tool({
    description:
      "Update a task's fields such as title, description, status, or priority. Only specified fields will be changed.",
    inputSchema: z.object({
      id: z.string().describe("The UUID of the task to update"),
      title: z.string().optional().describe("Updated title"),
      description: z.string().optional().describe("Updated description"),
      status: z
        .enum(["todo", "in_progress", "done", "blocked"])
        .optional()
        .describe("New task status"),
      priority: z
        .enum(["critical", "high", "medium", "low"])
        .optional()
        .describe("Updated priority"),
      effortEstimate: z.string().optional(),
      assignedTo: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
    execute: async ({
      id,
      title,
      description,
      status,
      priority,
      effortEstimate,
      assignedTo,
      tags,
    }) => {
      const existing = await getTaskById(id);
      if (!existing) {
        return { error: "Task not found." };
      }

      await updateTaskDB({
        id,
        title,
        description,
        status,
        priority,
        effortEstimate,
        assignedTo,
        tags,
        maintainedBy: CHAT_ASSISTANT_USER_ID,
      });

      const updated = await getTaskById(id);

      return {
        id,
        title: updated?.title ?? existing.title,
        content: `Task "${updated?.title ?? existing.title}" has been updated successfully.`,
      };
    },
  });
