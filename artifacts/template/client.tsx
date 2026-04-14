"use client";

import { useCallback, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  EyeIcon as LucideEyeIcon,
  FileTextIcon,
  GitForkIcon,
  GlobeIcon,
  VariableIcon,
  XIcon,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  CodeIcon,
  CopyIcon,
  EyeIcon,
  SaveIcon,
} from "@/components/icons";
import { Editor } from "@/components/text-editor";
import type { EditorMode } from "@/components/text-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useArtifact } from "@/hooks/use-artifact";
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

interface ValidationResult {
  valid: boolean;
  errors: Array<{ type: string; message: string }>;
  warnings: Array<{ type: string; message: string }>;
}

interface PreviewResult {
  metadata: Record<string, unknown>;
  variables: TemplateVariable[];
  variableDefinitions: VariableDefinition[];
  validation: ValidationResult;
  preview: string;
}

type TemplateArtifactMetadata = {
  editorMode: EditorMode;
  /** "category/name" of template being edited (null = browser mode) */
  selectedTemplate: string | null;
  isDirty: boolean;
  isSaving: boolean;
};

const categoryColors: Record<string, string> = {
  feature: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  spec: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
};

// ---------------------------------------------------------------------------
// Browser view — shows all templates grouped by category
// ---------------------------------------------------------------------------

function TemplatesBrowserView({
  onSelectTemplate,
}: {
  onSelectTemplate: (template: ResolvedTemplate) => void;
}) {
  const { data: templates, isLoading } = useSWR<ResolvedTemplate[]>(
    "/api/templates",
    fetcher,
  );

  if (isLoading) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  if (!templates || templates.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileTextIcon className="mx-auto mb-3 size-12 opacity-30" />
          <p>No templates found</p>
        </div>
      </div>
    );
  }

  // Group by category
  const grouped = templates.reduce(
    (acc, t) => {
      if (!acc[t.category]) acc[t.category] = [];
      acc[t.category].push(t);
      return acc;
    },
    {} as Record<string, ResolvedTemplate[]>,
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <FileTextIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Template Editor</h2>
            <p className="text-xs text-muted-foreground">
              Manage templates with variable placeholders
            </p>
          </div>
        </div>
        <Badge variant="secondary">{templates.length} templates</Badge>
      </div>

      {/* Cards grouped by category */}
      <div className="flex-1 overflow-y-auto p-4">
        {Object.entries(grouped).map(([category, tmps]) => (
          <div key={category} className="mb-6">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-xs ${categoryColors[category] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}
              >
                {category}
              </span>
              <span className="text-xs font-normal">({tmps.length})</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {tmps.map((t) => (
                <Card
                  key={`${t.category}/${t.name}`}
                  className="cursor-pointer transition-colors hover:bg-accent"
                  onClick={() => onSelectTemplate(t)}
                >
                  <CardHeader className="p-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-medium">
                        {(t.metadata.displayName as string) || t.name}
                      </CardTitle>
                      <OriginBadge origin={t.origin} />
                    </div>
                    <CardDescription className="text-xs line-clamp-2">
                      {(t.metadata.description as string) || "No description"}
                    </CardDescription>
                    <div className="mt-1 flex items-center gap-2">
                      {typeof t.metadata.version === "string" && (
                        <Badge variant="outline" className="text-xs">
                          v{t.metadata.version}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor view — Milkdown/raw for a single template + variable sidebar
// ---------------------------------------------------------------------------

function TemplateEditorView({
  templateId,
  content,
  editorMode,
  onSaveContent,
  onBack,
}: {
  templateId: string;
  content: string;
  editorMode: EditorMode;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  onBack: () => void;
}) {
  const [showVariables, setShowVariables] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null,
  );
  const [previewValues, setPreviewValues] = useState<Record<string, string>>(
    {},
  );

  const handleShowVariables = useCallback(async () => {
    if (showVariables) {
      setShowVariables(false);
      return;
    }
    try {
      const response = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, values: previewValues }),
      });
      if (!response.ok) throw new Error("Preview failed");
      const result = await response.json();
      setPreviewResult(result);
      setShowVariables(true);
    } catch {
      toast.error("Failed to analyze template variables");
    }
  }, [showVariables, content, previewValues]);

  const handleRefreshPreview = useCallback(async () => {
    try {
      const response = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, values: previewValues }),
      });
      if (!response.ok) throw new Error("Preview failed");
      const result = await response.json();
      setPreviewResult(result);
    } catch {
      toast.error("Failed to refresh preview");
    }
  }, [content, previewValues]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <XIcon className="mr-1.5 size-3.5" />
          Back to Templates
        </Button>
        <span className="text-sm font-medium">{templateId}</span>
        <div className="ml-auto">
          <Button
            size="sm"
            variant={showVariables ? "secondary" : "outline"}
            onClick={handleShowVariables}
          >
            <VariableIcon className="mr-1.5 size-3.5" />
            Variables
          </Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Milkdown / Raw editor */}
        <div className="flex-1 min-h-0">
          <Editor
            content={content}
            currentVersionIndex={0}
            editorMode={editorMode}
            isCurrentVersion={true}
            onSaveContent={onSaveContent}
            status="idle"
          />
        </div>

        {/* Variable sidebar */}
        {showVariables && previewResult && (
          <div className="w-72 shrink-0 overflow-y-auto border-l bg-muted/30 p-4">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Variables & Preview</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowVariables(false)}
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>

            {/* Validation status */}
            <ValidationStatus validation={previewResult.validation} />

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
                          <span className="ml-1 opacity-60">({def.type})</span>
                        )}
                      </p>
                      {def.type === "enum" && def.values ? (
                        <select
                          className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
                          value={
                            previewValues[def.name] ?? def.default ?? ""
                          }
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

            {/* Inline variables (no definition) */}
            {(() => {
              const undefinedVars = [
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
              ];
              if (undefinedVars.length === 0) return null;
              return (
                <div className="mb-4">
                  <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Inline Variables
                  </h4>
                  <div className="space-y-2">
                    {undefinedVars.map((name) => {
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
              );
            })()}

            {/* Refresh preview */}
            <Button
              size="sm"
              className="mb-4 w-full"
              onClick={handleRefreshPreview}
            >
              <LucideEyeIcon className="mr-1.5 size-3.5" />
              Refresh Preview
            </Button>

            {/* Rendered output */}
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
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function ValidationStatus({
  validation,
}: {
  validation: ValidationResult;
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

// ---------------------------------------------------------------------------
// Artifact content wrapper (uses hooks)
// ---------------------------------------------------------------------------

function TemplateArtifactContent({
  content,
  onSaveContent,
  metadata,
  setMetadata,
}: {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  metadata: TemplateArtifactMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<TemplateArtifactMetadata>>;
}) {
  const { setArtifact } = useArtifact();

  const handleSelectTemplate = useCallback(
    (template: ResolvedTemplate) => {
      // Build full content with frontmatter
      const frontmatter = Object.entries(template.metadata)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            return `${key}:\n${value.map((item) => `  - ${typeof item === "object" ? JSON.stringify(item) : item}`).join("\n")}`;
          }
          if (typeof value === "string" && value.includes("\n")) {
            return `${key}: >\n  ${value}`;
          }
          return `${key}: ${value}`;
        })
        .join("\n");

      const fullContent = frontmatter
        ? `---\n${frontmatter}\n---\n\n${template.content}`
        : template.content;

      const templateId = `${template.category}/${template.name}`;

      setMetadata((prev) => ({
        ...prev,
        selectedTemplate: templateId,
        isDirty: false,
      }));

      setArtifact((current) => ({
        ...current,
        title: `Template: ${(template.metadata.displayName as string) || templateId}`,
        content: fullContent,
      }));
    },
    [setMetadata, setArtifact],
  );

  const handleBack = useCallback(() => {
    setMetadata((prev) => ({
      ...prev,
      selectedTemplate: null,
      isDirty: false,
    }));
    setArtifact((current) => ({
      ...current,
      title: "Template Editor",
      content: "",
    }));
  }, [setMetadata, setArtifact]);

  const handleEditorSave = useCallback(
    (markdown: string, debounce: boolean) => {
      onSaveContent(markdown, debounce);
      setMetadata((prev) => ({ ...prev, isDirty: true }));
    },
    [onSaveContent, setMetadata],
  );

  if (!metadata?.selectedTemplate) {
    return <TemplatesBrowserView onSelectTemplate={handleSelectTemplate} />;
  }

  return (
    <TemplateEditorView
      templateId={metadata.selectedTemplate}
      content={content}
      editorMode={metadata.editorMode ?? "wysiwyg"}
      onSaveContent={handleEditorSave}
      onBack={handleBack}
    />
  );
}

// ---------------------------------------------------------------------------
// Artifact definition
// ---------------------------------------------------------------------------

export const templateArtifact = new Artifact<
  "template",
  TemplateArtifactMetadata
>({
  kind: "template",
  description:
    "SPLM template browser & editor with variable placeholders and Milkdown/raw toggle.",

  initialize: ({ setMetadata }) => {
    setMetadata({
      editorMode: "wysiwyg",
      selectedTemplate: null,
      isDirty: false,
      isSaving: false,
    });
  },

  onStreamPart: () => {},

  content: ({
    content,
    onSaveContent,
    isLoading,
    metadata,
    setMetadata,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    return (
      <TemplateArtifactContent
        content={content}
        metadata={metadata}
        onSaveContent={onSaveContent}
        setMetadata={setMetadata}
      />
    );
  },

  actions: [
    {
      icon: <CodeIcon size={18} />,
      description: "Toggle raw markdown editor",
      onClick: ({ metadata, setMetadata }) => {
        if (!metadata?.selectedTemplate) return;
        const current = metadata?.editorMode ?? "wysiwyg";
        setMetadata({
          ...metadata,
          editorMode: current === "wysiwyg" ? "markdown" : "wysiwyg",
        });
      },
      isDisabled: ({ metadata }) => !metadata?.selectedTemplate,
    },
    {
      icon: <SaveIcon size={18} />,
      description: "Save template",
      onClick: async ({ content, metadata, setMetadata }) => {
        if (!metadata?.selectedTemplate || metadata.isSaving) return;

        const [category, name] = metadata.selectedTemplate.split("/");
        setMetadata((prev) => ({ ...prev, isSaving: true }));

        try {
          const response = await fetch("/api/templates", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ category, name, content }),
          });

          if (!response.ok) throw new Error("Failed to save template");

          setMetadata((prev) => ({
            ...prev,
            isDirty: false,
            isSaving: false,
          }));
          toast.success("Template saved successfully!");
        } catch (error) {
          setMetadata((prev) => ({ ...prev, isSaving: false }));
          toast.error("Failed to save template.");
          console.error("Save error:", error);
        }
      },
      isDisabled: ({ metadata }) =>
        !metadata?.selectedTemplate || metadata?.isSaving || false,
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy to clipboard",
      onClick: ({ content, metadata }) => {
        if (!metadata?.selectedTemplate) return;
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
      isDisabled: ({ metadata }) => !metadata?.selectedTemplate,
    },
  ],

  toolbar: [],
});
