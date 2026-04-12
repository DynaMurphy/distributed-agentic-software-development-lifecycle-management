import type { MCPServerConfig } from "@github/copilot-sdk";
import path from "node:path";

/**
 * MCP server configurations for SPLM tools.
 * The SPLM MCP server provides 28 tools for feature, bug, task,
 * spec, and backlog management.
 */
export function getSplmMcpConfig(): Record<string, MCPServerConfig> {
  const mcpServerPath = path.resolve(
    process.cwd(),
    "mcp-server/build/index.js"
  );

  return {
    splm: {
      type: "stdio",
      command: "node",
      args: [mcpServerPath],
      tools: ["*"],
      env: {
        // Pass through database connection for the MCP server
        POSTGRES_URL: process.env.POSTGRES_URL ?? "",
        CHAT_ASSISTANT_USER_ID: process.env.CHAT_ASSISTANT_USER_ID ?? "",
      },
    },
  };
}
