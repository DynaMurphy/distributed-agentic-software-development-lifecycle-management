"use client";

import { useCallback, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  BookOpenIcon,
  BrainCircuitIcon,
  GitForkIcon,
  GlobeIcon,
  XIcon,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  CheckCircleFillIcon,
  CodeIcon,
  CopyIcon,
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
import { useArtifact } from "@/hooks/use-artifact";
import { fetcher } from "@/lib/utils";

interface ResolvedSkill {
  name: string;
  filePath: string;
  content: string;
  origin: "repo-override" | "hub-global" | "built-in";
  metadata: Record<string, unknown>;
}

type SkillArtifactMetadata = {
  editorMode: EditorMode;
  /** Name of the skill currently being edited (null = browser mode) */
  selectedSkill: string | null;
  isDirty: boolean;
  isSaving: boolean;
};

interface SkillTestResult {
  valid: boolean;
  sections: string[];
  wordCount: number;
  hasTitle: boolean;
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
  };
}

// ---------------------------------------------------------------------------
// Browser view — shows all skills as cards
// ---------------------------------------------------------------------------

function SkillsBrowserView({
  onSelectSkill,
}: {
  onSelectSkill: (skill: ResolvedSkill) => void;
}) {
  const { data: skills, isLoading } = useSWR<ResolvedSkill[]>(
    "/api/skills",
    fetcher,
  );

  if (isLoading) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  if (!skills || skills.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <BookOpenIcon className="mx-auto mb-3 size-12 opacity-30" />
          <p>No skills found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <BrainCircuitIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Skills Browser</h2>
            <p className="text-xs text-muted-foreground">
              View, edit, and test SPLM agent skills
            </p>
          </div>
        </div>
        <Badge variant="secondary">{skills.length} skills</Badge>
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {skills.map((skill) => (
            <Card
              key={skill.name}
              className="cursor-pointer transition-colors hover:bg-accent"
              onClick={() => onSelectSkill(skill)}
            >
              <CardHeader className="p-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">
                    {(skill.metadata.displayName as string) || skill.name}
                  </CardTitle>
                  <OriginBadge origin={skill.origin} />
                </div>
                <CardDescription className="text-xs line-clamp-2">
                  {(skill.metadata.description as string) || "No description"}
                </CardDescription>
                <div className="mt-1 flex items-center gap-2">
                  {typeof skill.metadata.version === "string" && (
                    <Badge variant="outline" className="text-xs">
                      v{skill.metadata.version}
                    </Badge>
                  )}
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor view — Milkdown/raw for a single skill
// ---------------------------------------------------------------------------

function SkillEditorView({
  skillName,
  content,
  editorMode,
  onSaveContent,
  onBack,
}: {
  skillName: string;
  content: string;
  editorMode: EditorMode;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Button size="sm" variant="ghost" onClick={onBack}>
          <XIcon className="mr-1.5 size-3.5" />
          Back to Skills
        </Button>
        <span className="text-sm font-medium">{skillName}</span>
      </div>

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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Origin badge helper
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

// ---------------------------------------------------------------------------
// Artifact content wrapper (uses hooks)
// ---------------------------------------------------------------------------

function SkillArtifactContent({
  content,
  onSaveContent,
  metadata,
  setMetadata,
}: {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  metadata: SkillArtifactMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<SkillArtifactMetadata>>;
}) {
  const { artifact, setArtifact } = useArtifact();

  // Sync metadata when navigating back via breadcrumbs/pop
  useEffect(() => {
    if (artifact.documentId === "skills-browser" && metadata?.selectedSkill) {
      setMetadata((prev) => ({ ...prev, selectedSkill: null, isDirty: false }));
    }
  }, [artifact.documentId, metadata?.selectedSkill, setMetadata]);

  const handleSelectSkill = useCallback(
    (skill: ResolvedSkill) => {
      // Build full content with frontmatter
      const frontmatter = Object.entries(skill.metadata)
        .map(([key, value]) => {
          if (typeof value === "string" && value.includes("\n")) {
            return `${key}: >\n  ${value}`;
          }
          return `${key}: ${value}`;
        })
        .join("\n");

      const fullContent = frontmatter
        ? `---\n${frontmatter}\n---\n\n${skill.content}`
        : skill.content;

      setMetadata((prev) => ({
        ...prev,
        selectedSkill: skill.name,
        isDirty: false,
      }));

      setArtifact((current) => ({
        ...current,
        documentId: `skill:${skill.name}`,
        title: `Skill: ${(skill.metadata.displayName as string) || skill.name}`,
        content: fullContent,
      }));
    },
    [setMetadata, setArtifact],
  );

  const handleBack = useCallback(() => {
    setMetadata((prev) => ({
      ...prev,
      selectedSkill: null,
      isDirty: false,
    }));
    setArtifact((current) => ({
      ...current,
      documentId: "skills-browser",
      title: "Skills Browser",
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

  if (!metadata?.selectedSkill) {
    return <SkillsBrowserView onSelectSkill={handleSelectSkill} />;
  }

  return (
    <SkillEditorView
      skillName={metadata.selectedSkill}
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

export const skillArtifact = new Artifact<"skill", SkillArtifactMetadata>({
  kind: "skill",
  description: "SPLM skill browser & editor with Milkdown/raw toggle.",

  initialize: ({ setMetadata }) => {
    setMetadata({
      editorMode: "wysiwyg",
      selectedSkill: null,
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
      <SkillArtifactContent
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
        if (!metadata?.selectedSkill) return;
        const current = metadata?.editorMode ?? "wysiwyg";
        setMetadata({
          ...metadata,
          editorMode: current === "wysiwyg" ? "markdown" : "wysiwyg",
        });
      },
      isDisabled: ({ metadata }) => !metadata?.selectedSkill,
    },
    {
      icon: <SaveIcon size={18} />,
      description: "Save skill",
      onClick: async ({ content, metadata, setMetadata }) => {
        if (!metadata?.selectedSkill || metadata.isSaving) return;

        setMetadata((prev) => ({ ...prev, isSaving: true }));

        try {
          const response = await fetch("/api/skills", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: metadata.selectedSkill,
              content,
            }),
          });

          if (!response.ok) throw new Error("Failed to save skill");

          setMetadata((prev) => ({
            ...prev,
            isDirty: false,
            isSaving: false,
          }));
          toast.success("Skill saved successfully!");
        } catch (error) {
          setMetadata((prev) => ({ ...prev, isSaving: false }));
          toast.error("Failed to save skill.");
          console.error("Save error:", error);
        }
      },
      isDisabled: ({ metadata }) =>
        !metadata?.selectedSkill || metadata?.isSaving || false,
    },
    {
      icon: <CheckCircleFillIcon size={18} />,
      description: "Test skill structure",
      onClick: ({ content, metadata }) => {
        if (!metadata?.selectedSkill) return;
        const result = analyzeSkillContent(content);
        if (result.valid) {
          toast.success(
            `Skill is valid: ${result.sections.length} sections, ${result.wordCount} words`,
          );
        } else {
          const issues: string[] = [];
          if (!result.hasTitle) issues.push("missing # title heading");
          if (result.sections.length === 0)
            issues.push("no ## sections found");
          if (result.wordCount <= 50)
            issues.push(`only ${result.wordCount} words (need >50)`);
          toast.warning(`Skill issues: ${issues.join(", ")}`);
        }
      },
      isDisabled: ({ metadata }) => !metadata?.selectedSkill,
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy to clipboard",
      onClick: ({ content, metadata }) => {
        if (!metadata?.selectedSkill) return;
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
      isDisabled: ({ metadata }) => !metadata?.selectedSkill,
    },
  ],

  toolbar: [],
});
