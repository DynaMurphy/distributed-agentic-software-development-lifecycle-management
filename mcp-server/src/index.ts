import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { query } from "./db.js";
import { SfdtUtils } from "./sfdt-utils.js";

const server = new Server(
  {
    name: "spec-driven-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_spec",
        description: "Reads the latest specification document from the database and returns it as text/markdown.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "append_spec_note",
        description: "Appends a note to the end of the latest specification document.",
        inputSchema: {
          type: "object",
          properties: {
            note: {
              type: "string",
              description: "The note to append to the document.",
            },
          },
          required: ["note"],
        },
      },
      {
        name: "propose_spec_change",
        description: "Proposes a change to the specification using track-changes. Replaces original_text with new_text.",
        inputSchema: {
          type: "object",
          properties: {
            original_text: {
              type: "string",
              description: "The exact text to be replaced.",
            },
            new_text: {
              type: "string",
              description: "The new text to insert.",
            },
          },
          required: ["original_text", "new_text"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    if (request.params.name === "read_spec") {
      const result = await query('SELECT * FROM current_documents ORDER BY valid_from DESC LIMIT 1');
      if (result.rows.length === 0) {
        return {
          content: [{ type: "text", text: "No documents found." }],
        };
      }
      
      const doc = result.rows[0];
      const markdown = SfdtUtils.sfdtToMarkdown(doc.content);
      
      return {
        content: [{ type: "text", text: `Title: ${doc.title}\n\n${markdown}` }],
      };
    }

    if (request.params.name === "append_spec_note") {
      const args = request.params.arguments as { note: string };
      if (!args.note) {
        throw new Error("Note is required");
      }

      const result = await query('SELECT * FROM current_documents ORDER BY valid_from DESC LIMIT 1');
      if (result.rows.length === 0) {
         throw new Error("No document found to append note to.");
      }

      const doc = result.rows[0];
      const updatedContent = SfdtUtils.appendNote(doc.content, args.note);
      
      await query('SELECT update_document_version($1, $2, $3)', [doc.id, doc.title, JSON.stringify(updatedContent)]);

      return {
        content: [{ type: "text", text: "Note appended successfully." }],
      };
    }

    if (request.params.name === "propose_spec_change") {
      const args = request.params.arguments as { original_text: string; new_text: string };
      if (!args.original_text || !args.new_text) {
        throw new Error("original_text and new_text are required");
      }

      const result = await query('SELECT * FROM current_documents ORDER BY valid_from DESC LIMIT 1');
      if (result.rows.length === 0) {
         throw new Error("No document found to update.");
      }

      const doc = result.rows[0];
      const updatedContent = SfdtUtils.applyRevision(doc.content, args.original_text, args.new_text);
      
      await query('SELECT update_document_version($1, $2, $3)', [doc.id, doc.title, JSON.stringify(updatedContent)]);

      return {
        content: [{ type: "text", text: "Change proposed successfully (Track Changes)." }],
      };
    }

    throw new Error(`Tool not found: ${request.params.name}`);
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
