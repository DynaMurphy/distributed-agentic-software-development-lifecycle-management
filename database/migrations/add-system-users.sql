-- =============================================================================
-- Migration: Add system users for actor tracking
-- =============================================================================
-- Creates two system user rows in the User table:
--   1. "system:chat-assistant"  — used when the in-app Chat AI modifies SPLM data
--   2. "system:mcp-assistant"   — used when the MCP server (VS Code Copilot) modifies SPLM data
--
-- Run after the Drizzle migration that adds the system_user column.
-- The generated UUIDs must be placed into .env.local as:
--   CHAT_ASSISTANT_USER_ID=<uuid>
--   MCP_ASSISTANT_USER_ID=<uuid>
-- =============================================================================

-- Insert system users (idempotent — skips if email already exists)
INSERT INTO "User" (email, password, "system_user")
SELECT 'system:chat-assistant', NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'system:chat-assistant');

INSERT INTO "User" (email, password, "system_user")
SELECT 'system:mcp-assistant', NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'system:mcp-assistant');

-- Output the generated UUIDs for .env.local configuration
SELECT id, email FROM "User" WHERE "system_user" = TRUE ORDER BY email;
