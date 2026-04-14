/**
 * Skill and template override resolution engine.
 *
 * Resolution hierarchy (highest priority first):
 * 1. Repository-local: {repoPath}/.splm/skills/ or .splm/templates/
 * 2. Hub-global: {hubRoot}/splm-skills/ or splm-templates/
 * 3. Built-in defaults (embedded in code)
 *
 * Repo-local files replace hub-global files by matching name.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** Describes the origin of a resolved asset */
export type AssetOrigin = "repo-override" | "hub-global" | "built-in";

/** A resolved skill */
export interface ResolvedSkill {
  /** Skill directory name (e.g., "triage") */
  name: string;
  /** Absolute path to the SKILL.md file */
  filePath: string;
  /** Full markdown content of the skill */
  content: string;
  /** Where this skill was resolved from */
  origin: AssetOrigin;
  /** Parsed frontmatter metadata */
  metadata: Record<string, unknown>;
}

/** A resolved template */
export interface ResolvedTemplate {
  /** Template file name without extension (e.g., "default") */
  name: string;
  /** Category: feature, bug, or spec */
  category: string;
  /** Absolute path to the template file */
  filePath: string;
  /** Full markdown content of the template */
  content: string;
  /** Where this template was resolved from */
  origin: AssetOrigin;
  /** Parsed frontmatter metadata */
  metadata: Record<string, unknown>;
}

/** Configuration for the resolver */
export interface ResolverConfig {
  /** Absolute path to the hub root directory */
  hubRoot: string;
  /** Absolute path to the repository root (optional, for repo-local overrides) */
  repoRoot?: string;
}

/**
 * Parse YAML-like frontmatter from a markdown file.
 * Handles simple key: value pairs and nested structures.
 */
export function parseFrontmatter(content: string): {
  metadata: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { metadata: {}, body: content };
  }

  const frontmatterStr = match[1];
  const body = match[2];
  const metadata: Record<string, unknown> = {};

  for (const line of frontmatterStr.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const colonIndex = trimmed.indexOf(":");
    if (colonIndex > 0) {
      const key = trimmed.slice(0, colonIndex).trim();
      let value: unknown = trimmed.slice(colonIndex + 1).trim();

      // Handle quoted strings
      if (
        typeof value === "string" &&
        ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'")))
      ) {
        value = (value as string).slice(1, -1);
      }

      // Handle booleans
      if (value === "true") {
        value = true;
      }
      if (value === "false") {
        value = false;
      }

      // Handle arrays (simple inline)
      if (
        typeof value === "string" &&
        value.startsWith("[") &&
        value.endsWith("]")
      ) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((v) => v.trim());
      }

      // Handle multiline (>) — just use the key, value is empty
      if (value === ">") {
        value = "";
      }

      metadata[key] = value;
    }
  }

  return { metadata, body };
}

/**
 * List skill directories in a given skills root path.
 */
function listSkillDirs(skillsRoot: string): string[] {
  if (!existsSync(skillsRoot)) {
    return [];
  }
  try {
    return readdirSync(skillsRoot).filter((entry) => {
      const entryPath = path.join(skillsRoot, entry);
      return (
        statSync(entryPath).isDirectory() &&
        existsSync(path.join(entryPath, "SKILL.md"))
      );
    });
  } catch {
    return [];
  }
}

/**
 * List template files in a given templates root path, organized by category.
 */
function listTemplateDirs(
  templatesRoot: string,
): Array<{ category: string; name: string; filePath: string }> {
  if (!existsSync(templatesRoot)) {
    return [];
  }

  const results: Array<{ category: string; name: string; filePath: string }> =
    [];

  try {
    const categories = readdirSync(templatesRoot).filter((entry) =>
      statSync(path.join(templatesRoot, entry)).isDirectory(),
    );

    for (const category of categories) {
      const categoryPath = path.join(templatesRoot, category);
      const files = readdirSync(categoryPath).filter((f) => f.endsWith(".md"));
      for (const file of files) {
        results.push({
          category,
          name: file.replace(/\.md$/, ""),
          filePath: path.join(categoryPath, file),
        });
      }
    }
  } catch {
    // Directory not readable
  }

  return results;
}

/**
 * Resolve all skills for a given configuration.
 * Repo-local skills override hub-global skills by name.
 */
export function resolveSkills(config: ResolverConfig): ResolvedSkill[] {
  const hubSkillsRoot = path.join(config.hubRoot, "splm-skills");
  const repoSkillsRoot = config.repoRoot
    ? path.join(config.repoRoot, ".splm", "skills")
    : null;

  // Collect hub-global skills
  const hubSkills = new Map<string, ResolvedSkill>();
  for (const skillName of listSkillDirs(hubSkillsRoot)) {
    const filePath = path.join(hubSkillsRoot, skillName, "SKILL.md");
    try {
      const content = readFileSync(filePath, "utf-8");
      const { metadata, body } = parseFrontmatter(content);
      hubSkills.set(skillName, {
        name: skillName,
        filePath,
        content: body,
        origin: "hub-global",
        metadata,
      });
    } catch {
      // Unreadable file, skip
    }
  }

  // Override with repo-local skills
  if (repoSkillsRoot) {
    for (const skillName of listSkillDirs(repoSkillsRoot)) {
      const filePath = path.join(repoSkillsRoot, skillName, "SKILL.md");
      try {
        const content = readFileSync(filePath, "utf-8");
        const { metadata, body } = parseFrontmatter(content);
        hubSkills.set(skillName, {
          name: skillName,
          filePath,
          content: body,
          origin: "repo-override",
          metadata,
        });
      } catch {
        // Unreadable file, skip
      }
    }
  }

  return [...hubSkills.values()];
}

/**
 * Resolve a single skill by name.
 */
export function resolveSkill(
  name: string,
  config: ResolverConfig,
): ResolvedSkill | null {
  // Check repo-local first
  if (config.repoRoot) {
    const repoPath = path.join(
      config.repoRoot,
      ".splm",
      "skills",
      name,
      "SKILL.md",
    );
    if (existsSync(repoPath)) {
      try {
        const content = readFileSync(repoPath, "utf-8");
        const { metadata, body } = parseFrontmatter(content);
        return {
          name,
          filePath: repoPath,
          content: body,
          origin: "repo-override",
          metadata,
        };
      } catch {
        // Fall through to hub-global
      }
    }
  }

  // Check hub-global
  const hubPath = path.join(config.hubRoot, "splm-skills", name, "SKILL.md");
  if (existsSync(hubPath)) {
    try {
      const content = readFileSync(hubPath, "utf-8");
      const { metadata, body } = parseFrontmatter(content);
      return {
        name,
        filePath: hubPath,
        content: body,
        origin: "hub-global",
        metadata,
      };
    } catch {
      // Not found
    }
  }

  return null;
}

/**
 * Resolve all templates for a given configuration.
 * Repo-local templates override hub-global templates by category + name.
 */
export function resolveTemplates(
  config: ResolverConfig,
): ResolvedTemplate[] {
  const hubTemplatesRoot = path.join(config.hubRoot, "splm-templates");
  const repoTemplatesRoot = config.repoRoot
    ? path.join(config.repoRoot, ".splm", "templates")
    : null;

  // Collect hub-global templates
  const templateMap = new Map<string, ResolvedTemplate>();
  for (const t of listTemplateDirs(hubTemplatesRoot)) {
    const key = `${t.category}/${t.name}`;
    try {
      const content = readFileSync(t.filePath, "utf-8");
      const { metadata, body } = parseFrontmatter(content);
      templateMap.set(key, {
        name: t.name,
        category: t.category,
        filePath: t.filePath,
        content: body,
        origin: "hub-global",
        metadata,
      });
    } catch {
      // Unreadable file, skip
    }
  }

  // Override with repo-local templates
  if (repoTemplatesRoot) {
    for (const t of listTemplateDirs(repoTemplatesRoot)) {
      const key = `${t.category}/${t.name}`;
      try {
        const content = readFileSync(t.filePath, "utf-8");
        const { metadata, body } = parseFrontmatter(content);
        templateMap.set(key, {
          name: t.name,
          category: t.category,
          filePath: t.filePath,
          content: body,
          origin: "repo-override",
          metadata,
        });
      } catch {
        // Unreadable file, skip
      }
    }
  }

  return [...templateMap.values()];
}

/**
 * Resolve a single template by category and name.
 */
export function resolveTemplate(
  category: string,
  name: string,
  config: ResolverConfig,
): ResolvedTemplate | null {
  // Check repo-local first
  if (config.repoRoot) {
    const repoPath = path.join(
      config.repoRoot,
      ".splm",
      "templates",
      category,
      `${name}.md`,
    );
    if (existsSync(repoPath)) {
      try {
        const content = readFileSync(repoPath, "utf-8");
        const { metadata, body } = parseFrontmatter(content);
        return {
          name,
          category,
          filePath: repoPath,
          content: body,
          origin: "repo-override",
          metadata,
        };
      } catch {
        // Fall through
      }
    }
  }

  // Check hub-global
  const hubPath = path.join(
    config.hubRoot,
    "splm-templates",
    category,
    `${name}.md`,
  );
  if (existsSync(hubPath)) {
    try {
      const content = readFileSync(hubPath, "utf-8");
      const { metadata, body } = parseFrontmatter(content);
      return {
        name,
        category,
        filePath: hubPath,
        content: body,
        origin: "hub-global",
        metadata,
      };
    } catch {
      // Not found
    }
  }

  return null;
}

/**
 * Get skill directories for Copilot SDK skillDirectories config.
 * Returns absolute paths to skill directories, repo-local first.
 */
export function getSkillDirectories(config: ResolverConfig): string[] {
  const dirs: string[] = [];

  // Repo-local skills take precedence (listed first)
  if (config.repoRoot) {
    const repoSkillsRoot = path.join(config.repoRoot, ".splm", "skills");
    if (existsSync(repoSkillsRoot)) {
      dirs.push(repoSkillsRoot);
    }
  }

  // Hub-global skills as fallback
  const hubSkillsRoot = path.join(config.hubRoot, "splm-skills");
  if (existsSync(hubSkillsRoot)) {
    dirs.push(hubSkillsRoot);
  }

  return dirs;
}

/**
 * List available template categories and names for a given configuration.
 * Used for template selection UI / elicitation.
 */
export function listAvailableTemplates(
  config: ResolverConfig,
): Array<{
  category: string;
  name: string;
  displayName: string;
  description: string;
  origin: AssetOrigin;
}> {
  const templates = resolveTemplates(config);
  return templates.map((t) => ({
    category: t.category,
    name: t.name,
    displayName: (t.metadata.displayName as string) || t.name,
    description: (t.metadata.description as string) || "",
    origin: t.origin,
  }));
}
