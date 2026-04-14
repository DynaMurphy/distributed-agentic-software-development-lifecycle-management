/**
 * Template variable parser and validator.
 *
 * Supports:
 * - {{variableName}}           — required variable
 * - {{variableName:default}}   — variable with default value
 * - {{variableName|format}}    — variable with format directive
 *
 * Escaping: Use \\{{ to output literal {{ in templates.
 */

/** Parsed variable from a template */
export interface TemplateVariable {
  /** Raw match string including delimiters */
  raw: string;
  /** Variable name (alphanumeric + underscore) */
  name: string;
  /** Default value if provided via :default syntax */
  defaultValue?: string;
  /** Format directive if provided via |format syntax */
  format?: string;
  /** Position in the template string */
  startIndex: number;
  endIndex: number;
}

/** Frontmatter variable definition from template YAML */
export interface VariableDefinition {
  name: string;
  label: string;
  type: "string" | "date" | "enum" | "number" | "boolean" | "reference";
  required?: boolean;
  default?: string;
  values?: string[];
  description?: string;
}

/** Result of template validation */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: "undefined_variable" | "malformed_placeholder" | "missing_required";
  message: string;
  variable?: string;
  position?: { start: number; end: number };
}

export interface ValidationWarning {
  type: "unused_definition" | "no_default";
  message: string;
  variable?: string;
}

const VARIABLE_PATTERN = /(?<!\\)\{\{([a-zA-Z_]\w*)(?::([^}|]*))?(?:\|(\w+))?\}\}/g;

const MALFORMED_PATTERN = /(?<!\\)\{\{([^}]*)\}\}/g;

/**
 * Parse all template variables from a template string.
 */
export function parseVariables(template: string): TemplateVariable[] {
  const variables: TemplateVariable[] = [];
  let match: RegExpExecArray | null = null;

  const regex = new RegExp(VARIABLE_PATTERN.source, "g");
  match = regex.exec(template);
  while (match !== null) {
    variables.push({
      raw: match[0],
      name: match[1],
      defaultValue: match[2],
      format: match[3],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
    match = regex.exec(template);
  }

  return variables;
}

/**
 * Substitute template variables with provided values.
 * Falls back to default values, then leaves placeholder for missing values.
 */
export function substituteVariables(
  template: string,
  values: Record<string, string>,
): string {
  let result = template.replace(
    new RegExp(VARIABLE_PATTERN.source, "g"),
    (raw, name: string, defaultValue?: string) => {
      if (name in values) {
        return values[name];
      }
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      return raw;
    },
  );

  // Unescape literal \{{ to {{
  result = result.replace(/\\\{\{/g, "{{");

  return result;
}

/**
 * Validate a template against variable definitions.
 */
export function validateTemplate(
  template: string,
  definitions: VariableDefinition[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const parsed = parseVariables(template);
  const definedNames = new Set(definitions.map((d) => d.name));
  const usedNames = new Set(parsed.map((v) => v.name));

  // Check for malformed placeholders
  const malformedRegex = new RegExp(MALFORMED_PATTERN.source, "g");
  const validRegex = new RegExp(VARIABLE_PATTERN.source, "g");
  const allMatches: Array<{ match: string; index: number }> = [];
  let m = malformedRegex.exec(template);
  while (m !== null) {
    allMatches.push({ match: m[0], index: m.index });
    m = malformedRegex.exec(template);
  }

  const validMatches = new Set<number>();
  let v = validRegex.exec(template);
  while (v !== null) {
    validMatches.add(v.index);
    v = validRegex.exec(template);
  }

  for (const am of allMatches) {
    if (!validMatches.has(am.index)) {
      errors.push({
        type: "malformed_placeholder",
        message: `Malformed placeholder: ${am.match}`,
        position: { start: am.index, end: am.index + am.match.length },
      });
    }
  }

  // Check for undefined variables (used but not defined)
  for (const variable of parsed) {
    if (definitions.length > 0 && !definedNames.has(variable.name)) {
      errors.push({
        type: "undefined_variable",
        message: `Variable "{{${variable.name}}}" is used but not defined in frontmatter`,
        variable: variable.name,
        position: {
          start: variable.startIndex,
          end: variable.endIndex,
        },
      });
    }
  }

  // Check for required variables without defaults
  for (const def of definitions) {
    if (def.required && !usedNames.has(def.name)) {
      // Required variable is defined but never used — just a warning
      warnings.push({
        type: "unused_definition",
        message: `Required variable "${def.name}" is defined but not used in template`,
        variable: def.name,
      });
    }
  }

  // Check for unused definitions
  for (const def of definitions) {
    if (!usedNames.has(def.name)) {
      warnings.push({
        type: "unused_definition",
        message: `Variable "${def.name}" is defined but not used in template`,
        variable: def.name,
      });
    }
  }

  // Check for variables with no default and no definition default
  for (const variable of parsed) {
    const def = definitions.find((d) => d.name === variable.name);
    if (
      variable.defaultValue === undefined &&
      (!def || def.default === undefined) &&
      (!def || !def.required)
    ) {
      warnings.push({
        type: "no_default",
        message: `Variable "{{${variable.name}}}" has no default value`,
        variable: variable.name,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Extract unique variable names from a template.
 */
export function extractVariableNames(template: string): string[] {
  const variables = parseVariables(template);
  return [...new Set(variables.map((v) => v.name))];
}
