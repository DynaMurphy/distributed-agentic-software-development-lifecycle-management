"use client";

import { useCallback, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { toast } from "sonner";
import {
  BookOpenIcon,
  BrainCircuitIcon,
  CheckCircleIcon,
  EditIcon,
  EyeIcon,
  GlobeIcon,
  GitForkIcon,
  SaveIcon,
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
import { fetcher } from "@/lib/utils";

interface ResolvedSkill {
  name: string;
  filePath: string;
  content: string;
  origin: "repo-override" | "hub-global" | "built-in";
  metadata: Record<string, unknown>;
}

interface SkillTestResult {
  valid: boolean;
  sections: string[];
  wordCount: number;
  hasTitle: boolean;
  hasFrontmatter: boolean;
}

function analyzeSkillContent(content: string): SkillTestResult {
  const sections = content
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s+/, ""));

  const hasTitle = content.trimStart().startsWith("# ");
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return {
    valid: hasTitle && sections.length > 0 && wordCount > 50,
    sections,
    wordCount,
    hasTitle,
    hasFrontmatter: true,
  };
}

export function SkillsBrowser() {
  const { data: skills, isLoading } = useSWR<ResolvedSkill[]>(
    "/api/skills",
    fetcher,
  );
  const { mutate } = useSWRConfig();
  const [selectedSkill, setSelectedSkill] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  const [testResult, setTestResult] = useState<SkillTestResult | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedSkillData = skills?.find((s) => s.name === selectedSkill);

  const handleEdit = useCallback(
    (skill: ResolvedSkill) => {
      // Reconstruct full content with frontmatter
      const frontmatter = Object.entries(skill.metadata)
        .map(([key, value]) => {
          if (typeof value === "string" && value.includes("\n")) {
            return `${key}: >\n  ${value}`;
          }
          return `${key}: ${value}`;
        })
        .join("\n");

      setEditContent(
        frontmatter
          ? `---\n${frontmatter}\n---\n\n${skill.content}`
          : skill.content,
      );
      setEditingSkill(skill.name);
      setPreviewMode(false);
      setTestResult(null);
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!editingSkill) return;
    setSaving(true);
    try {
      const response = await fetch("/api/skills", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingSkill, content: editContent }),
      });

      if (!response.ok) {
        throw new Error("Failed to save skill");
      }

      toast.success(`Skill "${editingSkill}" saved successfully`);
      setEditingSkill(null);
      mutate("/api/skills");
    } catch (error) {
      toast.error("Failed to save skill");
    } finally {
      setSaving(false);
    }
  }, [editingSkill, editContent, mutate]);

  const handleTest = useCallback(() => {
    const result = analyzeSkillContent(editContent);
    setTestResult(result);
  }, [editContent]);

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center text-muted-foreground">
        Loading skills…
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <BrainCircuitIcon className="size-6" />
          <div>
            <h1 className="text-xl font-semibold">Skills Browser</h1>
            <p className="text-sm text-muted-foreground">
              View, edit, and test SPLM agent skills
            </p>
          </div>
        </div>
        <Badge variant="secondary">{skills?.length ?? 0} skills</Badge>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Skill list */}
        <div className="w-80 shrink-0 overflow-y-auto border-r p-4">
          <div className="space-y-2">
            {skills?.map((skill) => (
              <Card
                key={skill.name}
                className={`cursor-pointer transition-colors hover:bg-accent ${
                  selectedSkill === skill.name ? "border-primary bg-accent" : ""
                }`}
                onClick={() => {
                  setSelectedSkill(skill.name);
                  setEditingSkill(null);
                  setTestResult(null);
                }}
              >
                <CardHeader className="p-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium">
                      {(skill.metadata.displayName as string) || skill.name}
                    </CardTitle>
                    <OriginBadge origin={skill.origin} />
                  </div>
                  <CardDescription className="text-xs line-clamp-2">
                    {(skill.metadata.description as string) ||
                      "No description"}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>

        {/* Skill detail / editor */}
        <div className="flex-1 overflow-y-auto">
          {editingSkill ? (
            <div className="flex h-full flex-col">
              {/* Editor toolbar */}
              <div className="flex items-center gap-2 border-b px-4 py-2">
                <span className="text-sm font-medium">
                  Editing: {editingSkill}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleTest}
                  >
                    <CheckCircleIcon className="mr-1.5 size-3.5" />
                    Test
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPreviewMode(!previewMode)}
                  >
                    <EyeIcon className="mr-1.5 size-3.5" />
                    {previewMode ? "Edit" : "Preview"}
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
                    onClick={() => setEditingSkill(null)}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                </div>
              </div>

              {/* Test results banner */}
              {testResult && (
                <SkillTestBanner result={testResult} />
              )}

              {/* Editor / Preview */}
              {previewMode ? (
                <div className="flex-1 overflow-y-auto p-6">
                  <SkillPreview content={editContent} />
                </div>
              ) : (
                <textarea
                  className="flex-1 resize-none bg-background p-6 font-mono text-sm focus:outline-none"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                />
              )}
            </div>
          ) : selectedSkillData ? (
            <div className="p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="mb-1 text-2xl font-semibold">
                    {(selectedSkillData.metadata.displayName as string) ||
                      selectedSkillData.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {(selectedSkillData.metadata.description as string) || ""}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <OriginBadge origin={selectedSkillData.origin} />
                    {typeof selectedSkillData.metadata.version === "string" && (
                      <Badge variant="outline">
                        v{selectedSkillData.metadata.version}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEdit(selectedSkillData)}
                >
                  <EditIcon className="mr-1.5 size-3.5" />
                  Edit
                </Button>
              </div>

              <SkillPreview content={selectedSkillData.content} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BookOpenIcon className="mx-auto mb-3 size-12 opacity-30" />
                <p>Select a skill to view its content</p>
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

function SkillPreview({ content }: { content: string }) {
  // Simple markdown rendering — headers, lists, tables, code blocks
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre
            key={`code-${i}`}
            className="my-2 overflow-x-auto rounded-md bg-muted p-3 text-xs"
          >
            <code>{codeContent.join("\n")}</code>
          </pre>,
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      continue;
    }

    // Tables
    if (line.includes("|") && line.trim().startsWith("|")) {
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.every((c) => /^[-:]+$/.test(c))) {
        // Separator row, skip
        continue;
      }
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(cells);
      // Check if next line is still a table row
      const nextLine = lines[i + 1];
      if (!nextLine || (!nextLine.trim().startsWith("|") && !nextLine.includes("---"))) {
        elements.push(
          <div key={`table-${i}`} className="my-2 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {tableRows[0]?.map((cell, ci) => (
                    <th
                      key={ci}
                      className="px-2 py-1 text-left font-semibold"
                    >
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, ri) => (
                  <tr key={ri} className="border-b">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-2 py-1">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
        inTable = false;
        tableRows = [];
      }
      continue;
    }

    // Headers
    if (line.startsWith("# ")) {
      elements.push(
        <h1 key={i} className="mb-3 mt-6 text-2xl font-bold first:mt-0">
          {line.slice(2)}
        </h1>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="mb-2 mt-5 text-xl font-semibold">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="mb-1 mt-4 text-lg font-medium">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }

    // Lists
    if (line.match(/^[-*]\s/)) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-sm">
          {line.slice(2)}
        </li>,
      );
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      const text = line.replace(/^\d+\.\s/, "");
      elements.push(
        <li key={i} className="ml-4 list-decimal text-sm">
          {text}
        </li>,
      );
      continue;
    }

    // Bold text inline
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    elements.push(
      <p key={i} className="text-sm leading-relaxed">
        {renderInline(line)}
      </p>,
    );
  }

  return <div className="prose prose-sm max-w-none dark:prose-invert">{elements}</div>;
}

function renderInline(text: string): React.ReactNode {
  // Very simple inline formatting: **bold**, `code`, _italic_
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|_[^_]+_)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  match = regex.exec(text);
  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    if (m.startsWith("**")) {
      parts.push(
        <strong key={match.index}>{m.slice(2, -2)}</strong>,
      );
    } else if (m.startsWith("`")) {
      parts.push(
        <code
          key={match.index}
          className="rounded bg-muted px-1 py-0.5 text-xs"
        >
          {m.slice(1, -1)}
        </code>,
      );
    } else if (m.startsWith("_")) {
      parts.push(<em key={match.index}>{m.slice(1, -1)}</em>);
    }
    lastIndex = match.index + m.length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length === 1 ? parts[0] : parts;
}

function SkillTestBanner({ result }: { result: SkillTestResult }) {
  return (
    <div
      className={`border-b px-4 py-3 text-sm ${
        result.valid
          ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200"
          : "border-yellow-200 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200"
      }`}
    >
      <div className="flex items-center gap-2">
        <CheckCircleIcon className="size-4" />
        <span className="font-medium">
          {result.valid ? "Skill structure is valid" : "Skill has issues"}
        </span>
      </div>
      <div className="mt-1 space-y-1 text-xs">
        <p>
          {result.hasTitle ? "✓" : "✗"} Has title heading &nbsp;|&nbsp;
          {result.sections.length} sections found &nbsp;|&nbsp;
          {result.wordCount} words
        </p>
        {result.sections.length > 0 && (
          <p>Sections: {result.sections.join(", ")}</p>
        )}
        {!result.hasTitle && (
          <p className="font-medium">
            Missing: Skill should start with a &quot;# Title&quot; heading
          </p>
        )}
        {result.sections.length === 0 && (
          <p className="font-medium">
            Missing: Skill should have &quot;## Section&quot; headings to
            structure guidance
          </p>
        )}
      </div>
    </div>
  );
}
