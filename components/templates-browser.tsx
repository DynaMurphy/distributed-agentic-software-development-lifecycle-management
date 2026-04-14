"use client";

import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  BookOpenIcon,
  EditIcon,
  EyeIcon,
  FileTextIcon,
  GitForkIcon,
  GlobeIcon,
  SaveIcon,
  VariableIcon,
  XIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetcher } from "@/lib/utils";

interface ResolvedTemplate {
  name: string;
  category: string;
  filePath: string;
  content: string;
  origin: "repo-override" | "hub-global" | "built-in";
  metadata: Record<string, unknown>;
}

interface TemplateVariable {
  raw: string;
  name: string;
  defaultValue?: string;
  format?: string;
  startIndex: number;
  endIndex: number;
}

interface VariableDefinition {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  default?: string;
  values?: string[];
  description?: string;
}

interface ValidationError {
  type: string;
  message: string;
  variable?: string;
}

interface ValidationWarning {
  type: string;
  message: string;
  variable?: string;
}

interface PreviewResult {
  metadata: Record<string, unknown>;
  variables: TemplateVariable[];
  variableDefinitions: VariableDefinition[];
  validation: {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
  preview: string;
}

const categoryColors: Record<string, string> = {
  feature: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  spec: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

export function TemplatesBrowser() {
  const { data: templates, isLoading } = useSWR<ResolvedTemplate[]>(
    "/api/templates",
    fetcher,
  );
  const { mutate } = useSWRConfig();

  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null,
  );
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    {},
  );
  const [showPreview, setShowPreview] = useState(false);

  const selectedTemplateData = templates?.find(
    (t) => `${t.category}/${t.name}` === selectedTemplate,
  );

  // Group templates by category
  const groupedTemplates = templates?.reduce(
    (acc, t) => {
      if (!acc[t.category]) acc[t.category] = [];
      acc[t.category].push(t);
      return acc;
    },
    {} as Record<string, ResolvedTemplate[]>,
  );

  const handleEdit = useCallback((template: ResolvedTemplate) => {
    // Reconstruct with frontmatter
    const frontmatter = Object.entries(template.metadata)
      .map(([key, value]) => {
        if (Array.isArray(value)) {
          return `${key}:\n${value.map((v) => `  - ${typeof v === "object" ? JSON.stringify(v) : v}`).join("\n")}`;
        }
        if (typeof value === "string" && value.includes("\n")) {
          return `${key}: >\n  ${value}`;
        }
        return `${key}: ${value}`;
      })
      .join("\n");

    setEditContent(
      frontmatter
        ? `---\n${frontmatter}\n---\n\n${template.content}`
        : template.content,
    );
    setEditingTemplate(`${template.category}/${template.name}`);
    setPreviewResult(null);
    setPreviewValues({});
    setShowPreview(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editingTemplate) return;
    const [category, name] = editingTemplate.split("/");
    setSaving(true);
    try {
      const response = await fetch("/api/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, name, content: editContent }),
      });

      if (!response.ok) throw new Error("Failed to save");

      toast.success(`Template "${name}" saved`);
      setEditingTemplate(null);
      mutate("/api/templates");
    } catch {
      toast.error("Failed to save template");
    } finally {
      setSaving(false);
    }
  }, [editingTemplate, editContent, mutate]);

  const handlePreview = useCallback(async () => {
    try {
      const response = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, values: previewValues }),
      });

      if (!response.ok) throw new Error("Preview failed");

      const result = await response.json();
      setPreviewResult(result);
      setShowPreview(true);
    } catch {
      toast.error("Failed to generate preview");
    }
  }, [editContent, previewValues]);

  // Also preview the selected (non-editing) template
  const handleViewPreview = useCallback(
    async (template: ResolvedTemplate) => {
      try {
        const fullContent = Object.keys(template.metadata).length > 0
          ? `---\n${Object.entries(template.metadata)
              .map(([k, v]) => {
                if (Array.isArray(v)) {
                  return `${k}:\n${v.map((item) => `  - ${typeof item === "object" ? JSON.stringify(item) : item}`).join("\n")}`;
                }
                return `${k}: ${v}`;
              })
              .join("\n")}\n---\n\n${template.content}`
          : template.content;

        const response = await fetch("/api/templates/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: fullContent, values: {} }),
        });

        if (!response.ok) throw new Error("Preview failed");

        const result = await response.json();
        setPreviewResult(result);
        setPreviewValues({});
        setShowPreview(true);
      } catch {
        toast.error("Failed to load template preview");
      }
    },
    [],
  );

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading templates…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <FileTextIcon className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Template Editor</h1>
            <p className="text-sm text-muted-foreground">
              Manage templates with variable placeholders
            </p>
          </div>
        </div>
        <Badge variant="secondary">{templates?.length ?? 0} templates</Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Template list grouped by category */}
        <div className="w-80 shrink-0 overflow-y-auto border-r p-4">
          {groupedTemplates &&
            Object.entries(groupedTemplates).map(([category, tmps]) => (
              <div key={category} className="mb-6">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs ${categoryColors[category] ?? "bg-gray-100 text-gray-800"}`}
                  >
                    {category}
                  </span>
                  <span className="text-xs font-normal">
                    ({tmps.length})
                  </span>
                </h3>
                <div className="space-y-2">
                  {tmps.map((t) => {
                    const key = `${t.category}/${t.name}`;
                    return (
                      <Card
                        key={key}
                        className={`cursor-pointer transition-colors hover:bg-accent ${
                          selectedTemplate === key
                            ? "border-primary bg-accent"
                            : ""
                        }`}
                        onClick={() => {
                          setSelectedTemplate(key);
                          setEditingTemplate(null);
                          setPreviewResult(null);
                          setShowPreview(false);
                        }}
                      >
                        <CardHeader className="p-3">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-sm font-medium">
                              {(t.metadata.displayName as string) || t.name}
                            </CardTitle>
                            <OriginBadge origin={t.origin} />
                          </div>
                          <CardDescription className="text-xs line-clamp-2">
                            {(t.metadata.description as string) || ""}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>

        {/* Template detail / editor */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            {editingTemplate ? (
              <div className="flex h-full flex-col">
                {/* Editor toolbar */}
                <div className="flex items-center gap-2 border-b px-4 py-2">
                  <span className="text-sm font-medium">
                    Editing: {editingTemplate}
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={handlePreview}>
                      <EyeIcon className="mr-1.5 size-3.5" />
                      Preview
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSave}
                      disabled={saving}
                    >
                      <SaveIcon className="mr-1.5 size-3.5" />
                      {saving ? "Saving…" : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingTemplate(null)}
                    >
                      <XIcon className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <textarea
                  className="flex-1 resize-none bg-background p-6 font-mono text-sm focus:outline-none"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                />
              </div>
            ) : selectedTemplateData ? (
              <div className="p-6">
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <h2 className="mb-1 text-2xl font-semibold">
                      {(selectedTemplateData.metadata.displayName as string) ||
                        selectedTemplateData.name}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {(selectedTemplateData.metadata.description as string) ||
                        ""}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${categoryColors[selectedTemplateData.category] ?? ""}`}
                      >
                        {selectedTemplateData.category}
                      </span>
                      <OriginBadge origin={selectedTemplateData.origin} />
                      {typeof selectedTemplateData.metadata.version === "string" && (
                        <Badge variant="outline">
                          v{selectedTemplateData.metadata.version}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewPreview(selectedTemplateData)}
                    >
                      <VariableIcon className="mr-1.5 size-3.5" />
                      Variables
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(selectedTemplateData)}
                    >
                      <EditIcon className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                  </div>
                </div>

                {/* Template content with highlighted variables */}
                <HighlightedTemplate content={selectedTemplateData.content} />
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <FileTextIcon className="mx-auto mb-3 size-12 opacity-30" />
                  <p>Select a template to view</p>
                </div>
              </div>
            )}
          </div>

          {/* Variable sidebar (preview panel) */}
          {showPreview && previewResult && (
            <div className="w-80 shrink-0 overflow-y-auto border-l bg-muted/30 p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Variables & Preview</h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowPreview(false)}
                >
                  <XIcon className="size-3.5" />
                </Button>
              </div>

              {/* Validation status */}
              <ValidationStatus
                validation={previewResult.validation}
              />

              {/* Variable definitions */}
              {previewResult.variableDefinitions.length > 0 && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Defined Variables
                  </h4>
                  <div className="space-y-3">
                    {previewResult.variableDefinitions.map((def) => (
                      <div key={def.name}>
                        <Label className="mb-1 flex items-center gap-1.5 text-xs">
                          <code className="rounded bg-muted px-1 py-0.5 font-mono">
                            {`{{${def.name}}}`}
                          </code>
                          {def.required && (
                            <span className="text-red-500">*</span>
                          )}
                        </Label>
                        <p className="mb-1 text-xs text-muted-foreground">
                          {def.label}
                          {def.type !== "string" && (
                            <span className="ml-1 opacity-60">
                              ({def.type})
                            </span>
                          )}
                        </p>
                        {def.type === "enum" && def.values ? (
                          <select
                            className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                            value={previewValues[def.name] ?? def.default ?? ""}
                            onChange={(e) =>
                              setPreviewValues((prev) => ({
                                ...prev,
                                [def.name]: e.target.value,
                              }))
                            }
                          >
                            <option value="">— select —</option>
                            {def.values.map((v) => (
                              <option key={v} value={v}>
                                {v}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <Input
                            className="h-7 text-xs"
                            placeholder={def.default || def.label}
                            value={previewValues[def.name] ?? ""}
                            onChange={(e) =>
                              setPreviewValues((prev) => ({
                                ...prev,
                                [def.name]: e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detected variables without definitions */}
              {previewResult.variables.filter(
                (v) =>
                  !previewResult.variableDefinitions.find(
                    (d) => d.name === v.name,
                  ),
              ).length > 0 && (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Inline Variables
                  </h4>
                  <div className="space-y-2">
                    {[
                      ...new Set(
                        previewResult.variables
                          .filter(
                            (v) =>
                              !previewResult.variableDefinitions.find(
                                (d) => d.name === v.name,
                              ),
                          )
                          .map((v) => v.name),
                      ),
                    ].map((name) => {
                      const variable = previewResult.variables.find(
                        (v) => v.name === name,
                      )!;
                      return (
                        <div key={name}>
                          <Label className="mb-1 text-xs">
                            <code className="rounded bg-muted px-1 py-0.5 font-mono">
                              {`{{${name}}}`}
                            </code>
                            {variable.defaultValue && (
                              <span className="ml-1 text-muted-foreground">
                                default: {variable.defaultValue}
                              </span>
                            )}
                          </Label>
                          <Input
                            className="h-7 text-xs"
                            placeholder={variable.defaultValue || name}
                            value={previewValues[name] ?? ""}
                            onChange={(e) =>
                              setPreviewValues((prev) => ({
                                ...prev,
                                [name]: e.target.value,
                              }))
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Re-preview button */}
              {editingTemplate && (
                <Button
                  size="sm"
                  className="mb-4 w-full"
                  onClick={handlePreview}
                >
                  <EyeIcon className="mr-1.5 size-3.5" />
                  Refresh Preview
                </Button>
              )}

              {/* Rendered preview */}
              <div className="mb-2">
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Rendered Output
                </h4>
                <div className="rounded-md border bg-background p-3 text-xs">
                  <pre className="whitespace-pre-wrap font-mono">
                    {previewResult.preview}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function OriginBadge({ origin }: { origin: string }) {
  if (origin === "repo-override") {
    return (
      <Badge variant="secondary" className="text-xs">
        <GitForkIcon className="mr-1 size-3" />
        Override
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      <GlobeIcon className="mr-1 size-3" />
      Hub
    </Badge>
  );
}

/** Render template with variable placeholders highlighted */
function HighlightedTemplate({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  const regex = /(?<!\\)\{\{([a-zA-Z_]\w*)(?::([^}|]*))?(?:\|(\w+))?\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = regex.exec(content);
  while (match !== null) {
    // Text before the variable
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {content.slice(lastIndex, match.index)}
        </span>,
      );
    }

    const varName = match[1];
    const defaultVal = match[2];

    parts.push(
      <span
        key={`var-${match.index}`}
        className="inline-flex items-center rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-xs text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
        title={
          defaultVal
            ? `Variable: ${varName} (default: ${defaultVal})`
            : `Variable: ${varName}`
        }
      >
        <VariableIcon className="mr-0.5 size-3" />
        {varName}
        {defaultVal && (
          <span className="ml-1 opacity-60">:{defaultVal}</span>
        )}
      </span>,
    );

    lastIndex = match.index + match[0].length;
    match = regex.exec(content);
  }

  if (lastIndex < content.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>{content.slice(lastIndex)}</span>,
    );
  }

  return (
    <pre className="whitespace-pre-wrap rounded-md border bg-muted/30 p-4 font-mono text-sm">
      {parts}
    </pre>
  );
}

function ValidationStatus({
  validation,
}: {
  validation: {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
}) {
  if (validation.valid && validation.warnings.length === 0) {
    return (
      <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
        ✓ Template is valid
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-1.5">
      {validation.errors.map((err, i) => (
        <div
          key={`err-${i}`}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
        >
          ✗ {err.message}
        </div>
      ))}
      {validation.warnings.map((warn, i) => (
        <div
          key={`warn-${i}`}
          className="rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200"
        >
          ⚠ {warn.message}
        </div>
      ))}
    </div>
  );
}
