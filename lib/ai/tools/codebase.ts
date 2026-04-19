import { tool } from "ai";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * Project root — resolved once.
 * All file operations are sandboxed to this directory.
 */
const PROJECT_ROOT = process.cwd();

/**
 * Resolve a user-supplied path and ensure it stays within the project root.
 * Throws if the resolved path escapes the sandbox.
 */
function safePath(relativePath: string): string {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    throw new Error(`Path "${relativePath}" is outside the project directory.`);
  }
  return resolved;
}

/** Patterns to always exclude from directory listings and search results */
const EXCLUDED = [
  "node_modules",
  ".next",
  ".git",
  "dist",
  "build",
  ".turbo",
  ".vercel",
  "pnpm-lock.yaml",
  "package-lock.json",
];

function isExcluded(name: string): boolean {
  return EXCLUDED.some((e) => name === e || name.startsWith(e + path.sep));
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export const readFileContent = tool({
  description:
    "Read the contents of a file in the project. Returns the file text. " +
    "Use startLine/endLine to read a specific range (1-based, inclusive). " +
    "Paths are relative to the project root.",
  inputSchema: z.object({
    filePath: z.string().describe("Relative path to the file (e.g. 'lib/ai/providers.ts')"),
    startLine: z.number().optional().describe("First line to read (1-based). Omit to read from the beginning."),
    endLine: z.number().optional().describe("Last line to read (1-based, inclusive). Omit to read to the end."),
  }),
  execute: async ({ filePath, startLine, endLine }) => {
    try {
      const absPath = safePath(filePath);
      const content = await fs.readFile(absPath, "utf-8");
      const lines = content.split("\n");

      const start = startLine ? Math.max(1, startLine) : 1;
      const end = endLine ? Math.min(lines.length, endLine) : lines.length;
      const slice = lines.slice(start - 1, end);

      return {
        filePath,
        totalLines: lines.length,
        startLine: start,
        endLine: end,
        content: slice.join("\n"),
      };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const listDirectory = tool({
  description:
    "List files and directories at a given path in the project. " +
    "Returns names with a trailing '/' for directories. " +
    "Excludes node_modules, .git, .next, and build artifacts.",
  inputSchema: z.object({
    dirPath: z
      .string()
      .default(".")
      .describe("Relative directory path (e.g. 'lib/ai'). Defaults to project root."),
  }),
  execute: async ({ dirPath }) => {
    try {
      const absPath = safePath(dirPath);
      const entries = await fs.readdir(absPath, { withFileTypes: true });
      const items = entries
        .filter((e) => !isExcluded(e.name))
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .sort();
      return { dirPath, items };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const searchCode = tool({
  description:
    "Search for a text pattern (plain text or regex) across the project codebase. " +
    "Returns matching file paths and line numbers with context. " +
    "Limited to 50 results. Excludes node_modules, .git, .next, and build artifacts.",
  inputSchema: z.object({
    pattern: z.string().describe("The text or regex pattern to search for."),
    includePattern: z
      .string()
      .optional()
      .describe("Glob to restrict search to specific files (e.g. '*.ts', 'lib/**/*.ts')."),
    maxResults: z
      .number()
      .optional()
      .default(30)
      .describe("Maximum number of matching lines to return (default: 30, max: 50)."),
  }),
  execute: async ({ pattern, includePattern, maxResults }) => {
    try {
      const limit = Math.min(maxResults ?? 30, 50);

      // Try grep first (most common on macOS/Linux)
      const args = [
        "-rn",
        "--include",
        includePattern || "*.{ts,tsx,js,jsx,json,md,css,sql,yaml,yml,toml,sh}",
        "-E",
        pattern,
        ".",
      ];

      // Add exclusions
      for (const ex of EXCLUDED) {
        args.unshift(`--exclude-dir=${ex}`);
      }

      const { stdout } = await execFileAsync("grep", args, {
        cwd: PROJECT_ROOT,
        maxBuffer: 1024 * 1024,
        timeout: 15_000,
      });

      const lines = stdout.split("\n").filter(Boolean).slice(0, limit);
      const results = lines.map((line) => {
        // Format: ./path/to/file.ts:123:matching line
        const match = line.match(/^\.\/(.+?):(\d+):(.*)$/);
        if (match) {
          return {
            file: match[1],
            line: Number.parseInt(match[2], 10),
            content: match[3].trim(),
          };
        }
        return { file: "", line: 0, content: line };
      });

      return { pattern, matchCount: results.length, results };
    } catch (err: unknown) {
      // grep returns exit code 1 when no matches found
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: number }).code === 1
      ) {
        return { pattern, matchCount: 0, results: [] };
      }
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const getFileTree = tool({
  description:
    "Get a tree view of the project structure up to a specified depth. " +
    "Useful for understanding the overall project layout. " +
    "Excludes node_modules, .git, .next, and build artifacts.",
  inputSchema: z.object({
    dirPath: z
      .string()
      .default(".")
      .describe("Relative directory path to start from. Defaults to project root."),
    depth: z
      .number()
      .default(3)
      .describe("Maximum depth to traverse (default: 3, max: 5)."),
  }),
  execute: async ({ dirPath, depth }) => {
    const maxDepth = Math.min(depth ?? 3, 5);
    const tree: string[] = [];

    async function walk(dir: string, prefix: string, currentDepth: number) {
      if (currentDepth > maxDepth) return;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        const filtered = entries
          .filter((e) => !isExcluded(e.name) && !e.name.startsWith("."))
          .sort((a, b) => {
            // Directories first
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
          });

        for (let i = 0; i < filtered.length; i++) {
          const entry = filtered[i];
          const isLast = i === filtered.length - 1;
          const connector = isLast ? "└── " : "├── ";
          const childPrefix = isLast ? "    " : "│   ";

          if (entry.isDirectory()) {
            tree.push(`${prefix}${connector}${entry.name}/`);
            await walk(
              path.join(dir, entry.name),
              prefix + childPrefix,
              currentDepth + 1
            );
          } else {
            tree.push(`${prefix}${connector}${entry.name}`);
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }

    try {
      const absPath = safePath(dirPath);
      await walk(absPath, "", 1);
      return { dirPath, depth: maxDepth, tree: tree.join("\n") };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  },
});
