import { approveAll } from "@github/copilot-sdk";
import type { PermissionHandler } from "@github/copilot-sdk";

/**
 * Permission handler for Copilot SDK sessions.
 *
 * In backend/server context we auto-approve all operations
 * since the session is already authenticated
 * and scoped to the user's permissions.
 */
export const serverPermissionHandler: PermissionHandler = approveAll;
