import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type {
  CopilotClientOptions,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";

let clientInstance: CopilotClient | null = null;
let startPromise: Promise<void> | null = null;

/**
 * Returns a singleton CopilotClient connected via stdio (spawns CLI)
 * or via TCP when COPILOT_CLI_URL is set.
 */
export async function getCopilotClient(): Promise<CopilotClient> {
  if (clientInstance) {
    return clientInstance;
  }

  const options: CopilotClientOptions = {
    logLevel: process.env.NODE_ENV === "development" ? "info" : "error",
  };

  // Connect to external CLI server if URL is provided
  if (process.env.COPILOT_CLI_URL) {
    options.cliUrl = process.env.COPILOT_CLI_URL;
  }

  // Pass GitHub token for Copilot Pro+ auth.
  // NOTE: Classic PATs (ghp_*) are NOT supported by the Copilot API.
  // Use an OAuth token from `gh auth token` or let the SDK handle device flow.
  if (process.env.COPILOT_GITHUB_TOKEN) {
    const token = process.env.COPILOT_GITHUB_TOKEN;
    if (token.startsWith("ghp_")) {
      console.warn(
        "[copilot] COPILOT_GITHUB_TOKEN is a classic PAT (ghp_*) which is not supported by the Copilot API. " +
        "Ignoring it — the SDK will fall back to GitHub CLI auth or device flow. " +
        "Run `gh auth login` with a Copilot Pro+ account, or remove COPILOT_GITHUB_TOKEN from your env."
      );
    } else {
      options.githubToken = token;
    }
  }

  clientInstance = new CopilotClient(options);

  // Ensure start is called only once
  if (!startPromise) {
    startPromise = clientInstance.start();
  }
  await startPromise;

  return clientInstance;
}

/**
 * Stop the client and release resources. Call during graceful shutdown.
 */
export async function stopCopilotClient(): Promise<void> {
  if (clientInstance) {
    await clientInstance.stop();
    clientInstance = null;
    startPromise = null;
  }
}

/**
 * Check if the Copilot SDK is configured (env vars present).
 */
export function isCopilotEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_COPILOT_SDK === "true" ||
    process.env.USE_COPILOT_SDK === "true"
  );
}

export { approveAll };
export type { SessionConfig, SessionEvent };
