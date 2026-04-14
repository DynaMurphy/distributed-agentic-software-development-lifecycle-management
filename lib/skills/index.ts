/**
 * Distributed Skills & Template System
 *
 * Public API for the skills resolution and template parsing system.
 * Used by Copilot SDK integration and MCP server.
 */

// Template parser — variable substitution and validation
export {
  parseVariables,
  substituteVariables,
  validateTemplate,
  extractVariableNames,
} from "./template-parser";

export type {
  TemplateVariable,
  VariableDefinition,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from "./template-parser";

// Resolver — skill and template override resolution
export {
  resolveSkills,
  resolveSkill,
  resolveTemplates,
  resolveTemplate,
  getSkillDirectories,
  listAvailableTemplates,
  parseFrontmatter,
} from "./resolver";

export type {
  AssetOrigin,
  ResolvedSkill,
  ResolvedTemplate,
  ResolverConfig,
} from "./resolver";
