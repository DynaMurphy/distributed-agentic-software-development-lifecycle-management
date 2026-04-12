import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  query,
  createFeature,
  updateFeature,
  getFeatureById,
  getSubFeatures,
  createBug,
  updateBug,
  getBugById,
  listTasks,
  getTaskById,
  createTask,
  updateTask,
  getBacklogItemByItemId,
  promoteToBacklog,
  updateBacklogItem,
  listDocuments,
  getDocumentById,
  createDocument,
  unlinkDocument,
  getDocumentsForItem,
  getDocumentLinksWithTitles,
  getWorkflowStatus,
} from "./db.js";
import { generateAIText } from "./ai.js";

const MCP_ASSISTANT_USER_ID = process.env.MCP_ASSISTANT_USER_ID;

const server = new Server(
  {
    name: "spec-driven-mcp-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const STATUS_DESC = "Status: draft, triage, backlog, spec_generation, implementation, testing, done, rejected";
const PRIORITY_DESC = "Priority: critical, high, medium, low";

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ── Spec Document Tools ─────────────────────────────────
      {
        name: "list_specs",
        description: "List all specification documents.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "read_spec",
        description: "Read a specification document as markdown. If no id is provided, reads the latest spec.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Optional: UUID of a specific spec to read. Omit to read the latest." },
          },
        },
      },
      {
        name: "append_spec_note",
        description: "Appends a note to the end of a specification document.",
        inputSchema: {
          type: "object",
          properties: {
            note: { type: "string", description: "The note to append to the document." },
            id: { type: "string", description: "Optional: UUID of the spec. Omit to use the latest." },
          },
          required: ["note"],
        },
      },
      {
        name: "propose_spec_change",
        description: "Proposes a change to a specification by finding and replacing text.",
        inputSchema: {
          type: "object",
          properties: {
            original_text: { type: "string", description: "The exact text to be replaced." },
            new_text: { type: "string", description: "The new text to insert." },
            id: { type: "string", description: "Optional: UUID of the spec. Omit to use the latest." },
          },
          required: ["original_text", "new_text"],
        },
      },
      {
        name: "batch_edit_spec",
        description: "Apply multiple find-and-replace edits to a specification in one operation.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Optional: UUID of the spec. Omit to use the latest." },
            edits: {
              type: "array",
              description: "Array of edits to apply.",
              items: {
                type: "object",
                properties: {
                  original_text: { type: "string", description: "The exact text to find and replace." },
                  new_text: { type: "string", description: "The replacement text." },
                  description: { type: "string", description: "Optional: human-readable description of this edit." },
                },
                required: ["original_text", "new_text"],
              },
            },
          },
          required: ["edits"],
        },
      },

      // ── Feature Tools ───────────────────────────────────────
      {
        name: "list_features",
        description: "List all features, optionally filtered by status, priority, or feature_type.",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: STATUS_DESC },
            priority: { type: "string", description: PRIORITY_DESC },
            feature_type: { type: "string", description: "Filter by type: feature or sub_feature" },
          },
        },
      },
      {
        name: "read_feature",
        description: "Read full details of a specific feature by ID, including sub-features.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Feature UUID" } },
          required: ["id"],
        },
      },
      {
        name: "create_feature",
        description: "Create a new feature or sub-feature.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Feature title" },
            description: { type: "string", description: "Detailed description" },
            feature_type: { type: "string", description: "feature (default) or sub_feature" },
            parent_id: { type: "string", description: "Parent feature UUID (for sub-features)" },
            priority: { type: "string", description: PRIORITY_DESC },
            effort_estimate: { type: "string", description: "Effort estimate: S, M, L, XL" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          },
          required: ["title"],
        },
      },
      {
        name: "update_feature",
        description: "Update any fields on an existing feature. Only provide fields you want to change.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Feature UUID" },
            title: { type: "string", description: "New title" },
            description: { type: "string", description: "New description" },
            feature_type: { type: "string", description: "feature or sub_feature" },
            status: { type: "string", description: STATUS_DESC },
            priority: { type: "string", description: PRIORITY_DESC },
            effort_estimate: { type: "string", description: "Effort estimate" },
            assigned_to: { type: "string", description: "Assigned user UUID" },
            tags: { type: "array", items: { type: "string" }, description: "New tags" },
          },
          required: ["id"],
        },
      },

      // ── Bug Tools ───────────────────────────────────────────
      {
        name: "list_bugs",
        description: "List all bugs, optionally filtered by status, severity, or priority.",
        inputSchema: {
          type: "object",
          properties: {
            status: { type: "string", description: STATUS_DESC },
            severity: { type: "string", description: "Severity: blocker, critical, major, minor, trivial" },
            priority: { type: "string", description: PRIORITY_DESC },
          },
        },
      },
      {
        name: "read_bug",
        description: "Read full details of a specific bug by ID.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Bug UUID" } },
          required: ["id"],
        },
      },
      {
        name: "create_bug",
        description: "Create a new bug report.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Bug title" },
            description: { type: "string", description: "Detailed description" },
            severity: { type: "string", description: "Severity: blocker, critical, major, minor, trivial" },
            priority: { type: "string", description: PRIORITY_DESC },
            steps_to_reproduce: { type: "string", description: "Steps to reproduce the bug" },
            expected_behavior: { type: "string", description: "Expected behavior" },
            actual_behavior: { type: "string", description: "Actual behavior" },
            environment: { type: "object", description: "Environment details (JSON)" },
            tags: { type: "array", items: { type: "string" }, description: "Tags for categorization" },
          },
          required: ["title"],
        },
      },
      {
        name: "update_bug",
        description: "Update any fields on an existing bug. Only provide fields you want to change.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Bug UUID" },
            title: { type: "string", description: "New title" },
            description: { type: "string", description: "New description" },
            severity: { type: "string", description: "New severity" },
            status: { type: "string", description: STATUS_DESC },
            priority: { type: "string", description: PRIORITY_DESC },
            steps_to_reproduce: { type: "string", description: "Steps to reproduce" },
            expected_behavior: { type: "string", description: "Expected behavior" },
            actual_behavior: { type: "string", description: "Actual behavior" },
            assigned_to: { type: "string", description: "Assigned user UUID" },
            tags: { type: "array", items: { type: "string" }, description: "New tags" },
          },
          required: ["id"],
        },
      },

      // ── Task Tools ──────────────────────────────────────────
      {
        name: "list_tasks",
        description: "List tasks, optionally filtered by parent feature/bug or status.",
        inputSchema: {
          type: "object",
          properties: {
            parent_type: { type: "string", description: "Filter by parent type: feature or bug" },
            parent_id: { type: "string", description: "Filter by parent UUID" },
            status: { type: "string", description: "Filter by status: todo, in_progress, done, blocked" },
          },
        },
      },
      {
        name: "read_task",
        description: "Read full details of a specific task by ID.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string", description: "Task UUID" } },
          required: ["id"],
        },
      },
      {
        name: "create_task",
        description: "Create a new task under a feature or bug.",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Task title" },
            description: { type: "string", description: "Task description" },
            parent_type: { type: "string", description: "Parent type: feature or bug" },
            parent_id: { type: "string", description: "Parent feature/bug UUID" },
            priority: { type: "string", description: PRIORITY_DESC },
            effort_estimate: { type: "string", description: "Effort estimate: S, M, L, XL" },
            tags: { type: "array", items: { type: "string" }, description: "Tags" },
          },
          required: ["title", "parent_type", "parent_id"],
        },
      },
      {
        name: "update_task",
        description: "Update any fields on an existing task. Only provide fields you want to change.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Task UUID" },
            title: { type: "string", description: "New title" },
            description: { type: "string", description: "New description" },
            status: { type: "string", description: "Status: todo, in_progress, done, blocked" },
            priority: { type: "string", description: PRIORITY_DESC },
            effort_estimate: { type: "string", description: "Effort estimate" },
            assigned_to: { type: "string", description: "Assigned user UUID" },
            tags: { type: "array", items: { type: "string" }, description: "Tags" },
          },
          required: ["id"],
        },
      },

      // ── Backlog Tools ───────────────────────────────────────
      {
        name: "list_backlog",
        description: "View the product backlog — a prioritized, ranked list of features and bugs ready for implementation.",
        inputSchema: {
          type: "object",
          properties: {
            sprint_label: { type: "string", description: "Filter by sprint label" },
            item_type: { type: "string", description: "Filter by type: feature or bug" },
          },
        },
      },
      {
        name: "promote_to_backlog",
        description: "Promote a feature or bug to the product backlog. Also sets the item's status to 'backlog'.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "Type: feature or bug" },
            item_id: { type: "string", description: "UUID of the feature or bug" },
            rank: { type: "number", description: "Position in backlog (lower = higher priority). Auto-calculated if omitted." },
            sprint_label: { type: "string", description: "Sprint/iteration label" },
            notes: { type: "string", description: "Product manager notes" },
          },
          required: ["item_type", "item_id"],
        },
      },
      {
        name: "update_backlog_item",
        description: "Update a backlog item's rank, sprint label, or notes.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Backlog item UUID" },
            rank: { type: "number", description: "New rank/position" },
            sprint_label: { type: "string", description: "New sprint label" },
            notes: { type: "string", description: "Updated notes" },
          },
          required: ["id"],
        },
      },

      // ── Document Linking Tools ──────────────────────────────
      {
        name: "link_document",
        description: "Link a specification document to a feature, bug, or task.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature, bug, or task" },
            item_id: { type: "string", description: "UUID of the item" },
            document_id: { type: "string", description: "UUID of the document" },
            link_type: { type: "string", description: "Link type: specification, test_plan, design, reference (default: specification)" },
          },
          required: ["item_type", "item_id", "document_id"],
        },
      },
      {
        name: "unlink_document",
        description: "Remove a link between a document and a work item.",
        inputSchema: {
          type: "object",
          properties: {
            link_id: { type: "string", description: "UUID of the link to remove" },
          },
          required: ["link_id"],
        },
      },
      {
        name: "get_item_documents",
        description: "Get all documents linked to a feature, bug, or task.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature, bug, or task" },
            item_id: { type: "string", description: "UUID of the item" },
          },
          required: ["item_type", "item_id"],
        },
      },

      // ── AI-Powered Tools ────────────────────────────────────
      {
        name: "triage_item",
        description: "AI-assisted triage of a feature or bug. Analyzes the item and suggests priority, effort, risk, and rationale. Updates the item's AI metadata.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature or bug" },
            item_id: { type: "string", description: "UUID of the feature or bug to triage" },
          },
          required: ["item_type", "item_id"],
        },
      },
      {
        name: "detect_duplicates",
        description: "Detect potential duplicate features or bugs using AI similarity analysis.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature or bug" },
            item_id: { type: "string", description: "UUID of the item to check" },
          },
          required: ["item_type", "item_id"],
        },
      },
      {
        name: "analyze_impact",
        description: "Analyze the impact of a feature or bug on existing specifications and backlog items using AI.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature or bug" },
            item_id: { type: "string", description: "UUID of the item to analyze" },
          },
          required: ["item_type", "item_id"],
        },
      },
      {
        name: "suggest_document_links",
        description: "AI suggests which specification documents should be linked to a feature or bug.",
        inputSchema: {
          type: "object",
          properties: {
            item_type: { type: "string", description: "feature, bug, or task" },
            item_id: { type: "string", description: "UUID of the item" },
          },
          required: ["item_type", "item_id"],
        },
      },
      {
        name: "generate_spec",
        description: "Generate a specification document from a feature or bug and its related data using AI. Creates a new document and links it to the item.",
        inputSchema: {
          type: "object",
          properties: {
            feature_id: { type: "string", description: "UUID of the feature or bug to generate a spec from" },
            item_type: { type: "string", enum: ["feature", "bug"], description: "Type of item (default: 'feature')" },
            spec_title: { type: "string", description: "Custom title for the spec. Defaults to 'Specification: <item title>'" },
            include_sub_features: { type: "boolean", description: "Include sub-features (default: true, features only)" },
            include_tasks: { type: "boolean", description: "Include tasks (default: true)" },
            include_linked_bugs: { type: "boolean", description: "Include linked bugs as known issues (default: true, features only)" },
          },
          required: ["feature_id"],
        },
      },

      // ── Workflow Tools ──────────────────────────────────────
      {
        name: "workflow_status",
        description: "Get a dashboard overview of the SPLM workflow: counts of features, bugs, tasks, and backlog items by status. Use this to understand the current state and decide what to work on next.",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  };
});

// =============================================================================
// TOOL HANDLERS
// =============================================================================

/** Helper to fetch a spec document by optional id, or the latest */
async function getSpecDoc(id?: string) {
  if (id) {
    return await getDocumentById(id);
  }
  const result = await query('SELECT DISTINCT ON (id) * FROM current_documents ORDER BY id, valid_from DESC LIMIT 1');
  return result.rows[0] ?? null;
}

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, any>;

    // ── Spec Document Handlers ──────────────────────────────

    if (name === "list_specs") {
      const docs = await listDocuments();
      return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
    }

    if (name === "read_spec") {
      const doc = await getSpecDoc(args.id);
      if (!doc) return { content: [{ type: "text", text: "No spec document found." }] };
      // Content is stored as markdown
      const markdown = typeof doc.content === 'string' ? doc.content : String(doc.content);
      return { content: [{ type: "text", text: `# ${doc.title}\n\n${markdown}` }] };
    }

    if (name === "append_spec_note") {
      if (!args.note) throw new Error("Note is required");
      const doc = await getSpecDoc(args.id);
      if (!doc) throw new Error("No spec document found.");
      // Append note to markdown content
      const currentContent = typeof doc.content === 'string' ? doc.content : String(doc.content);
      const updatedContent = currentContent.trimEnd() + `\n\n---\n\n**Note:** ${args.note}\n`;
      await query('SELECT update_document_version($1, $2, $3, $4, $5)', [doc.id, doc.title, updatedContent, null, MCP_ASSISTANT_USER_ID]);
      return { content: [{ type: "text", text: "Note appended successfully." }] };
    }

    if (name === "propose_spec_change") {
      if (!args.original_text || !args.new_text) throw new Error("original_text and new_text are required");
      const doc = await getSpecDoc(args.id);
      if (!doc) throw new Error("No spec document found.");
      const currentContent = typeof doc.content === 'string' ? doc.content : String(doc.content);
      if (!currentContent.includes(args.original_text)) {
        throw new Error("original_text not found in document content.");
      }
      const updatedContent = currentContent.replace(args.original_text, args.new_text);
      await query('SELECT update_document_version($1, $2, $3, $4, $5)', [doc.id, doc.title, updatedContent, null, MCP_ASSISTANT_USER_ID]);
      return { content: [{ type: "text", text: "Change applied successfully." }] };
    }

    if (name === "batch_edit_spec") {
      if (!args.edits || !Array.isArray(args.edits) || args.edits.length === 0) {
        throw new Error("At least one edit is required");
      }
      const doc = await getSpecDoc(args.id);
      if (!doc) throw new Error("No spec document found.");
      let content = typeof doc.content === 'string' ? doc.content : String(doc.content);
      let applied = 0;
      for (const edit of args.edits) {
        if (content.includes(edit.original_text)) {
          content = content.replace(edit.original_text, edit.new_text);
          applied++;
        }
      }
      await query('SELECT update_document_version($1, $2, $3, $4, $5)', [doc.id, doc.title, content, null, MCP_ASSISTANT_USER_ID]);
      return {
        content: [{ type: "text", text: `Applied ${applied}/${args.edits.length} edits successfully.` }],
      };
    }

    // ── Feature Handlers ────────────────────────────────────

    if (name === "list_features") {
      let sql = 'SELECT DISTINCT ON (id) id, title, feature_type, status, priority, valid_from FROM current_features WHERE 1=1';
      const params: any[] = [];
      if (args.status) { params.push(args.status); sql += ` AND status = $${params.length}`; }
      if (args.priority) { params.push(args.priority); sql += ` AND priority = $${params.length}`; }
      if (args.feature_type) { params.push(args.feature_type); sql += ` AND feature_type = $${params.length}`; }
      sql += ' ORDER BY id, valid_from DESC';
      const result = await query(sql, params);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    if (name === "read_feature") {
      const feature = await getFeatureById(args.id);
      if (!feature) return { content: [{ type: "text", text: "Feature not found." }] };
      const subs = await getSubFeatures(args.id);
      const tasks = await listTasks({ parentType: "feature", parentId: args.id });
      const docs = await getDocumentsForItem("feature", args.id);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ ...feature, sub_features: subs, tasks, linked_documents: docs }, null, 2),
        }],
      };
    }

    if (name === "create_feature") {
      if (!args.title) throw new Error("Title is required");
      const id = crypto.randomUUID();
      const versionId = await createFeature({
        id,
        title: args.title,
        description: args.description,
        featureType: args.feature_type,
        parentId: args.parent_id,
        priority: args.priority,
        effortEstimate: args.effort_estimate,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });

      // Auto-add to backlog in draft state
      await promoteToBacklog({
        id: crypto.randomUUID(),
        itemType: "feature",
        itemId: id,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });

      const feature = await getFeatureById(id);
      return {
        content: [{ type: "text", text: JSON.stringify({ created: true, id, versionId, feature }, null, 2) }],
      };
    }

    if (name === "update_feature") {
      if (!args.id) throw new Error("ID is required");
      const versionId = await updateFeature({
        id: args.id,
        title: args.title,
        description: args.description,
        featureType: args.feature_type,
        status: args.status,
        priority: args.priority,
        effortEstimate: args.effort_estimate,
        assignedTo: args.assigned_to,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });
      const feature = await getFeatureById(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ updated: true, versionId, feature }, null, 2) }],
      };
    }

    // ── Bug Handlers ────────────────────────────────────────

    if (name === "list_bugs") {
      let sql = 'SELECT DISTINCT ON (id) id, title, severity, status, priority, valid_from FROM current_bugs WHERE 1=1';
      const params: any[] = [];
      if (args.status) { params.push(args.status); sql += ` AND status = $${params.length}`; }
      if (args.severity) { params.push(args.severity); sql += ` AND severity = $${params.length}`; }
      if (args.priority) { params.push(args.priority); sql += ` AND priority = $${params.length}`; }
      sql += ' ORDER BY id, valid_from DESC';
      const result = await query(sql, params);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    if (name === "read_bug") {
      const bug = await getBugById(args.id);
      if (!bug) return { content: [{ type: "text", text: "Bug not found." }] };
      const tasks = await listTasks({ parentType: "bug", parentId: args.id });
      const docs = await getDocumentsForItem("bug", args.id);
      return {
        content: [{
          type: "text",
          text: JSON.stringify({ ...bug, tasks, linked_documents: docs }, null, 2),
        }],
      };
    }

    if (name === "create_bug") {
      if (!args.title) throw new Error("Title is required");
      const id = crypto.randomUUID();
      const versionId = await createBug({
        id,
        title: args.title,
        description: args.description,
        severity: args.severity,
        priority: args.priority,
        stepsToReproduce: args.steps_to_reproduce,
        expectedBehavior: args.expected_behavior,
        actualBehavior: args.actual_behavior,
        environment: args.environment,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });

      // Auto-add to backlog in draft state
      await promoteToBacklog({
        id: crypto.randomUUID(),
        itemType: "bug",
        itemId: id,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });

      const bug = await getBugById(id);
      return {
        content: [{ type: "text", text: JSON.stringify({ created: true, id, versionId, bug }, null, 2) }],
      };
    }

    if (name === "update_bug") {
      if (!args.id) throw new Error("ID is required");
      const versionId = await updateBug({
        id: args.id,
        title: args.title,
        description: args.description,
        severity: args.severity,
        status: args.status,
        priority: args.priority,
        stepsToReproduce: args.steps_to_reproduce,
        expectedBehavior: args.expected_behavior,
        actualBehavior: args.actual_behavior,
        assignedTo: args.assigned_to,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });
      const bug = await getBugById(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ updated: true, versionId, bug }, null, 2) }],
      };
    }

    // ── Task Handlers ───────────────────────────────────────

    if (name === "list_tasks") {
      const tasks = await listTasks({
        parentType: args.parent_type,
        parentId: args.parent_id,
        status: args.status,
      });
      return { content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }] };
    }

    if (name === "read_task") {
      const task = await getTaskById(args.id);
      if (!task) return { content: [{ type: "text", text: "Task not found." }] };
      return { content: [{ type: "text", text: JSON.stringify(task, null, 2) }] };
    }

    if (name === "create_task") {
      if (!args.title || !args.parent_type || !args.parent_id) {
        throw new Error("title, parent_type, and parent_id are required");
      }
      const id = crypto.randomUUID();
      const versionId = await createTask({
        id,
        title: args.title,
        description: args.description,
        parentType: args.parent_type,
        parentId: args.parent_id,
        priority: args.priority,
        effortEstimate: args.effort_estimate,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });
      const task = await getTaskById(id);
      return {
        content: [{ type: "text", text: JSON.stringify({ created: true, id, versionId, task }, null, 2) }],
      };
    }

    if (name === "update_task") {
      if (!args.id) throw new Error("ID is required");
      const versionId = await updateTask({
        id: args.id,
        title: args.title,
        description: args.description,
        status: args.status,
        priority: args.priority,
        effortEstimate: args.effort_estimate,
        assignedTo: args.assigned_to,
        tags: args.tags,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });
      const task = await getTaskById(args.id);
      return {
        content: [{ type: "text", text: JSON.stringify({ updated: true, versionId, task }, null, 2) }],
      };
    }

    // ── Backlog Handlers ────────────────────────────────────

    if (name === "list_backlog") {
      let innerSql = `SELECT DISTINCT ON (bi.id) bi.*,
        CASE WHEN bi.item_type = 'feature' THEN f.title WHEN bi.item_type = 'bug' THEN b.title END AS item_title,
        CASE WHEN bi.item_type = 'feature' THEN f.status WHEN bi.item_type = 'bug' THEN b.status END AS item_status,
        CASE WHEN bi.item_type = 'feature' THEN f.priority WHEN bi.item_type = 'bug' THEN b.priority END AS item_priority
      FROM current_backlog_items bi
      LEFT JOIN (SELECT DISTINCT ON (id) * FROM current_features WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) f ON bi.item_type = 'feature' AND bi.item_id = f.id
      LEFT JOIN (SELECT DISTINCT ON (id) * FROM current_bugs WHERE valid_to = 'infinity' ORDER BY id, valid_from DESC) b ON bi.item_type = 'bug' AND bi.item_id = b.id
      WHERE bi.valid_to = 'infinity'`;
      const params: any[] = [];
      if (args.sprint_label) { params.push(args.sprint_label); innerSql += ` AND bi.sprint_label = $${params.length}`; }
      if (args.item_type) { params.push(args.item_type); innerSql += ` AND bi.item_type = $${params.length}`; }
      innerSql += ' ORDER BY bi.id, bi.valid_from DESC';
      const sql = `SELECT * FROM (${innerSql}) sub ORDER BY sub.rank ASC`;
      const result = await query(sql, params);
      return { content: [{ type: "text", text: JSON.stringify(result.rows, null, 2) }] };
    }

    if (name === "promote_to_backlog") {
      if (!args.item_type || !args.item_id) throw new Error("item_type and item_id are required");

      // Check if already in backlog
      const existing = await getBacklogItemByItemId(args.item_type, args.item_id);
      if (existing) {
        return {
          content: [{ type: "text", text: `This ${args.item_type} is already in the backlog (rank #${existing.rank}).` }],
        };
      }

      // Verify item exists
      const item = args.item_type === "feature"
        ? await getFeatureById(args.item_id)
        : await getBugById(args.item_id);
      if (!item) throw new Error(`${args.item_type} not found.`);

      const backlogId = crypto.randomUUID();
      await promoteToBacklog({
        id: backlogId,
        itemType: args.item_type,
        itemId: args.item_id,
        rank: args.rank,
        sprintLabel: args.sprint_label,
        notes: args.notes,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });

      // Update the item's status to 'backlog'
      if (args.item_type === "feature") {
        await updateFeature({ id: args.item_id, status: "backlog", maintainedBy: MCP_ASSISTANT_USER_ID });
      } else {
        await updateBug({ id: args.item_id, status: "backlog", maintainedBy: MCP_ASSISTANT_USER_ID });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            promoted: true,
            backlogId,
            itemType: args.item_type,
            itemId: args.item_id,
            title: item.title,
          }, null, 2),
        }],
      };
    }

    if (name === "update_backlog_item") {
      if (!args.id) throw new Error("ID is required");
      const versionId = await updateBacklogItem({
        id: args.id,
        rank: args.rank,
        sprintLabel: args.sprint_label,
        notes: args.notes,
        maintainedBy: MCP_ASSISTANT_USER_ID,
      });
      return {
        content: [{ type: "text", text: JSON.stringify({ updated: true, versionId }, null, 2) }],
      };
    }

    // ── Document Link Handlers ──────────────────────────────

    if (name === "link_document") {
      const linkId = crypto.randomUUID();
      await query('SELECT insert_item_document_link_version($1, $2, $3, $4, $5, $6, $7)',
        [linkId, args.item_type, args.item_id, args.document_id, args.link_type || 'specification', null, MCP_ASSISTANT_USER_ID]);
      return {
        content: [{ type: "text", text: `Document ${args.document_id} linked to ${args.item_type} ${args.item_id} (link_id: ${linkId}).` }],
      };
    }

    if (name === "unlink_document") {
      await unlinkDocument(args.link_id);
      return { content: [{ type: "text", text: `Document link ${args.link_id} removed.` }] };
    }

    if (name === "get_item_documents") {
      const docs = await getDocumentsForItem(args.item_type, args.item_id);
      return { content: [{ type: "text", text: JSON.stringify(docs, null, 2) }] };
    }

    // ── AI-Powered Handlers ─────────────────────────────────

    if (name === "triage_item") {
      const item = args.item_type === "feature"
        ? await getFeatureById(args.item_id)
        : await getBugById(args.item_id);
      if (!item) throw new Error(`${args.item_type} not found.`);

      const triageResult = await generateAIText({
        system: `You are a senior product manager performing triage on software ${args.item_type}s. Analyze the following ${args.item_type} and provide a JSON assessment with these fields:
- suggestedPriority: "critical" | "high" | "medium" | "low"
- suggestedEffort: "S" | "M" | "L" | "XL"
- rationale: A brief explanation of your assessment (2-3 sentences)
- riskLevel: "high" | "medium" | "low"
- suggestedSprint: A suggestion for when to schedule this (e.g., "next sprint", "backlog", "urgent - current sprint")
Output ONLY valid JSON.`,
        prompt: `Title: ${item.title}\nDescription: ${item.description ?? "No description"}\nCurrent Priority: ${item.priority}\nStatus: ${item.status}${
          args.item_type === "bug" && item.severity
            ? `\nSeverity: ${item.severity}\nSteps to Reproduce: ${item.steps_to_reproduce ?? "Not provided"}\nExpected Behavior: ${item.expected_behavior ?? "Not provided"}\nActual Behavior: ${item.actual_behavior ?? "Not provided"}`
            : ""
        }`,
      });

      let triageData: Record<string, unknown> = {};
      try { triageData = JSON.parse(triageResult); } catch { triageData = { rawAssessment: triageResult }; }

      const aiMetadata = {
        ...(item.ai_metadata || {}),
        triage: { ...triageData, triagedAt: new Date().toISOString() },
      };

      if (args.item_type === "feature") {
        await updateFeature({ id: args.item_id, status: "triage", aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      } else {
        await updateBug({ id: args.item_id, status: "triage", aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ itemType: args.item_type, itemId: args.item_id, title: item.title, triage: triageData }, null, 2),
        }],
      };
    }

    if (name === "detect_duplicates") {
      const item = args.item_type === "feature"
        ? await getFeatureById(args.item_id)
        : await getBugById(args.item_id);
      if (!item) throw new Error(`${args.item_type} not found.`);

      // Get all items of the same type
      const allResult = args.item_type === "feature"
        ? await query('SELECT DISTINCT ON (id) id, title, description FROM current_features WHERE id != $1 ORDER BY id, valid_from DESC', [args.item_id])
        : await query('SELECT DISTINCT ON (id) id, title, description FROM current_bugs WHERE id != $1 ORDER BY id, valid_from DESC', [args.item_id]);

      if (allResult.rows.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ duplicates: [], message: "No other items to compare against." }) }] };
      }

      const result = await generateAIText({
        system: `You are analyzing ${args.item_type}s for potential duplicates. Compare the target item against the list and identify similar ones. Return a JSON array with fields: id, title, similarityScore (0-100), reason. Only include items with similarityScore >= 40. Output ONLY valid JSON array.`,
        prompt: `Target:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nExisting:\n${allResult.rows.map((i: any) => `- ID: ${i.id}, Title: ${i.title}`).join("\n")}`,
      });

      let duplicates: any[] = [];
      try { duplicates = JSON.parse(result); } catch { duplicates = []; }

      const aiMetadata = {
        ...(item.ai_metadata || {}),
        duplicateCheck: { candidates: duplicates, checkedAt: new Date().toISOString() },
      };

      if (args.item_type === "feature") {
        await updateFeature({ id: args.item_id, aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      } else {
        await updateBug({ id: args.item_id, aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            itemType: args.item_type,
            itemId: args.item_id,
            duplicates,
            message: duplicates.length > 0
              ? `Found ${duplicates.length} potential duplicate(s) for "${item.title}".`
              : `No duplicates found for "${item.title}".`,
          }, null, 2),
        }],
      };
    }

    if (name === "analyze_impact") {
      const item = args.item_type === "feature"
        ? await getFeatureById(args.item_id)
        : await getBugById(args.item_id);
      if (!item) throw new Error(`${args.item_type} not found.`);

      const linkedDocs = await getDocumentLinksWithTitles(args.item_type, args.item_id);
      const allSpecs = await listDocuments();
      const backlogResult = await query(`
        SELECT * FROM (
          SELECT DISTINCT ON (bi.id) bi.*, COALESCE(f.title, b.title) AS item_title
          FROM current_backlog_items bi
          LEFT JOIN (SELECT DISTINCT ON (id) * FROM current_features ORDER BY id, valid_from DESC) f ON bi.item_type = 'feature' AND bi.item_id = f.id
          LEFT JOIN (SELECT DISTINCT ON (id) * FROM current_bugs ORDER BY id, valid_from DESC) b ON bi.item_type = 'bug' AND bi.item_id = b.id
          ORDER BY bi.id, bi.valid_from DESC
        ) sub ORDER BY sub.rank ASC
      `);

      const result = await generateAIText({
        system: `You are a senior technical analyst performing impact analysis. Analyze the ${args.item_type} and evaluate its potential impact on existing specifications and backlog items. Return a JSON object with:
- impactedSpecs: array of { specId, specTitle, impactLevel: "high"|"medium"|"low", description }
- impactedBacklogItems: array of { itemId, itemTitle, relationship: "blocks"|"blocked_by"|"related", description }
- overallRisk: "high"|"medium"|"low"
- summary: brief impact summary (2-3 sentences)
- recommendations: array of action items
Output ONLY valid JSON.`,
        prompt: `${args.item_type.toUpperCase()}:\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\nPriority: ${item.priority}\nStatus: ${item.status}\n\nLinked Documents:\n${linkedDocs.map((d: any) => `- ${d.document_title} (${d.link_type})`).join("\n") || "None"}\n\nAll Specifications:\n${allSpecs.map((s: any) => `- ID: ${s.id}, Title: ${s.title}`).join("\n") || "None"}\n\nCurrent Backlog:\n${backlogResult.rows.map((b: any) => `- ${b.item_title} (${b.item_type}, rank #${b.rank})`).join("\n") || "Empty"}`,
      });

      let impactData: Record<string, unknown> = {};
      try { impactData = JSON.parse(result); } catch { impactData = { rawAnalysis: result }; }

      const aiMetadata = {
        ...(item.ai_metadata || {}),
        impactAnalysis: { ...impactData, analyzedAt: new Date().toISOString() },
      };

      if (args.item_type === "feature") {
        await updateFeature({ id: args.item_id, aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      } else {
        await updateBug({ id: args.item_id, aiMetadata, maintainedBy: MCP_ASSISTANT_USER_ID });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ itemType: args.item_type, itemId: args.item_id, title: item.title, impact: impactData }, null, 2),
        }],
      };
    }

    if (name === "suggest_document_links") {
      const item = args.item_type === "feature"
        ? await getFeatureById(args.item_id)
        : args.item_type === "bug"
          ? await getBugById(args.item_id)
          : await getTaskById(args.item_id);
      if (!item) throw new Error(`${args.item_type} not found.`);

      const allDocs = await listDocuments();
      const existingLinks = await getDocumentsForItem(args.item_type, args.item_id);

      if (allDocs.length === 0) {
        return { content: [{ type: "text", text: JSON.stringify({ suggestions: [], message: "No documents available." }) }] };
      }

      const result = await generateAIText({
        system: `You are analyzing which specification documents should be linked to a work item. Return a JSON array of suggestions: { documentId, documentTitle, linkType: "specification"|"test_plan"|"design"|"reference", confidence: 0-100, reason }. Only include relevant suggestions with confidence >= 40. Output ONLY valid JSON array.`,
        prompt: `Item (${args.item_type}):\nTitle: ${item.title}\nDescription: ${item.description ?? "No description"}\n\nAvailable Documents:\n${allDocs.map((d: any) => `- ID: ${d.id}, Title: ${d.title}`).join("\n")}\n\nAlready Linked:\n${existingLinks.map((l: any) => `- ${l.document_title} (${l.link_type})`).join("\n") || "None"}`,
      });

      let suggestions: any[] = [];
      try { suggestions = JSON.parse(result); } catch { suggestions = []; }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({ itemType: args.item_type, itemId: args.item_id, suggestions }, null, 2),
        }],
      };
    }

    if (name === "generate_spec") {
      if (!args.feature_id) throw new Error("feature_id (item ID) is required");

      const itemType: "feature" | "bug" = args.item_type === "bug" ? "bug" : "feature";
      const itemId = args.feature_id;

      // Fetch the item (feature or bug)
      let item: any;
      if (itemType === "bug") {
        item = await getBugById(itemId);
        if (!item) throw new Error("Bug not found.");
      } else {
        item = await getFeatureById(itemId);
        if (!item) throw new Error("Feature not found.");
      }

      const includeSubFeatures = args.include_sub_features !== false && itemType === "feature";
      const includeTasks = args.include_tasks !== false;
      const includeLinkedBugs = args.include_linked_bugs !== false && itemType === "feature";

      // Gather related data
      const subFeatures = includeSubFeatures ? await getSubFeatures(itemId) : [];
      const tasks = includeTasks ? await listTasks({ parentType: itemType, parentId: itemId }) : [];
      const linkedDocs = await getDocumentLinksWithTitles(itemType, itemId);

      // Gather linked bugs if needed (features only)
      let linkedBugs: any[] = [];
      if (includeLinkedBugs) {
        const bugLinks = await query(
          `SELECT DISTINCT ON (idl.id) idl.item_id, b.title, b.description, b.severity, b.status
           FROM current_item_document_links idl
           JOIN (SELECT DISTINCT ON (id) * FROM current_bugs ORDER BY id, valid_from DESC) b ON idl.item_id = b.id
           WHERE idl.item_type = 'bug'
           ORDER BY idl.id, idl.valid_from DESC`
        );
        linkedBugs = bugLinks.rows;
      }

      const title = args.spec_title ?? `Specification: ${item.title}`;

      // Build context based on item type
      const contextParts: string[] = [];
      if (itemType === "bug") {
        contextParts.push(
          `# Bug: ${item.title}`,
          `Severity: ${item.severity} | Priority: ${item.priority} | Status: ${item.status}`,
        );
        if (item.description) contextParts.push(`\n## Description\n${item.description}`);
        if (item.steps_to_reproduce) contextParts.push(`\n## Steps to Reproduce\n${item.steps_to_reproduce}`);
        if (item.expected_behavior) contextParts.push(`\n## Expected Behavior\n${item.expected_behavior}`);
        if (item.actual_behavior) contextParts.push(`\n## Actual Behavior\n${item.actual_behavior}`);
      } else {
        contextParts.push(
          `# Feature: ${item.title}`,
          `Priority: ${item.priority} | Status: ${item.status}`,
        );
        if (item.description) contextParts.push(`\n## Description\n${item.description}`);
        if (subFeatures.length > 0) {
          contextParts.push(`\n## Sub-Features\n${subFeatures.map((sf: any) => `- ${sf.title} (${sf.status})`).join("\n")}`);
        }
      }
      if (tasks.length > 0) {
        contextParts.push(`\n## Tasks\n${tasks.map((t: any) => `- ${t.title} (${t.status})`).join("\n")}`);
      }
      if (linkedBugs.length > 0) {
        contextParts.push(`\n## Known Issues\n${linkedBugs.map((b: any) => `- [${b.severity}] ${b.title}: ${b.description ?? "No description"}`).join("\n")}`);
      }
      if (linkedDocs.length > 0) {
        contextParts.push(`\n## Existing Linked Documents\n${linkedDocs.map((d: any) => `- ${d.document_title} (${d.link_type})`).join("\n")}`);
      }
      const context = contextParts.filter(Boolean).join("\n");

      // Generate spec content using AI
      const systemPrompt = itemType === "bug"
        ? `You are a senior technical writer creating a brief bug fix specification document. Based on the bug information provided, generate a concise specification that includes: Overview, Root Cause Analysis, Proposed Fix, Technical Approach, Testing Strategy, and Acceptance Criteria. Keep it focused and actionable. Write in clear, professional technical English.`
        : `You are a senior technical writer creating a software specification document. Based on the feature information provided, generate a comprehensive, well-structured specification document. Include: Overview, Requirements, Functional Specification, Technical Design Considerations, Acceptance Criteria, and any relevant sections. Write in clear, professional technical English.`;

      const specContent = await generateAIText({
        system: systemPrompt,
        prompt: context,
      });

      // Create the document with markdown content
      const docId = crypto.randomUUID();
      await createDocument({ id: docId, title, content: specContent, maintainedBy: MCP_ASSISTANT_USER_ID });

      // Link to the item
      const linkId = crypto.randomUUID();
      await query('SELECT insert_item_document_link_version($1, $2, $3, $4, $5, $6, $7)',
        [linkId, itemType, itemId, docId, 'specification', new Date().toISOString(), MCP_ASSISTANT_USER_ID]);

      // Update item status to spec_generation
      if (itemType === "bug") {
        await updateBug({ id: itemId, status: "spec_generation", maintainedBy: MCP_ASSISTANT_USER_ID });
      } else {
        await updateFeature({ id: itemId, status: "spec_generation", maintainedBy: MCP_ASSISTANT_USER_ID });
      }

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            generated: true,
            specId: docId,
            itemType,
            itemId,
            title,
            linkId,
            message: `Specification "${title}" generated and linked to ${itemType} "${item.title}". Status updated to spec_generation.`,
          }, null, 2),
        }],
      };
    }

    // ── Workflow Handler ────────────────────────────────────

    if (name === "workflow_status") {
      const status = await getWorkflowStatus();
      return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
    }

    throw new Error(`Tool not found: ${name}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `Error: ${errorMessage}` }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
