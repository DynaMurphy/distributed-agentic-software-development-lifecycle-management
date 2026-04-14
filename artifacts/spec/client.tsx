"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { Artifact } from "@/components/create-artifact";
import { DiffView } from "@/components/diffview";
import { DocumentSkeleton } from "@/components/document-skeleton";
import {
  ClockRewind,
  CodeIcon,
  CopyIcon,
  EyeIcon,
  MessageIcon,
  PenIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
} from "@/components/icons";
import { Editor } from "@/components/text-editor";
import type { EditorMode } from "@/components/text-editor";
import { LinkedItemsBadge } from "@/components/linked-items";
import { SpecViewer } from "@/components/spec-viewer";
import { useArtifact, useLiveSpecContent } from "@/hooks/use-artifact";

/**
 * Metadata for the spec artifact — tracks dirty state and the bitemporal document ID.
 */
type SpecArtifactMetadata = {
  /** Whether the editor content has been modified since last save */
  isDirty: boolean;
  /** The bitemporal document ID (from the `documents` table) */
  bitemporalDocId: string | null;
  /** Whether a save operation is in progress */
  isSaving: boolean;
  /** Current editor mode: view (read-only), WYSIWYG (milkdown) or raw markdown */
  editorMode: EditorMode | "view";
};

/**
 * Inner component for spec content that can use hooks.
 * Needed because the artifact `content` render function can't directly use hooks.
 */
function SpecContentInner({
  status,
  content,
  isCurrentVersion,
  currentVersionIndex,
  onSaveContent,
  metadata,
  setMetadata,
}: {
  status: "streaming" | "idle";
  content: string;
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  metadata: SpecArtifactMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<SpecArtifactMetadata>>;
}) {
  const editorMode = metadata?.editorMode ?? "view";
  const { setLiveSpecContent } = useLiveSpecContent();
  const { setArtifact } = useArtifact();

  const handleNavigateDocument = useCallback(
    (docId: string, linkText: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: docId,
        kind: "spec" as const,
        title: linkText,
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      }));
    },
    [setArtifact],
  );

  /**
   * Handle content changes from the Milkdown editor.
   * Updates local artifact state and marks as dirty, but does NOT persist.
   */
  const handleSaveContent = useCallback(
    (markdown: string, debounce: boolean) => {
      onSaveContent(markdown, debounce);
      setMetadata((prev) => ({ ...prev, isDirty: true }));
      setLiveSpecContent(markdown);
    },
    [onSaveContent, setMetadata, setLiveSpecContent]
  );

  // View mode: read-only Streamdown + mermaid rendering
  if (editorMode === "view") {
    return (
      <div className="flex flex-col w-full h-full min-h-[600px]">
        {metadata?.bitemporalDocId && (
          <LinkedItemsBadge documentId={metadata.bitemporalDocId} />
        )}
        <SpecViewer content={content} />
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-[600px]">
      {metadata?.bitemporalDocId && (
        <LinkedItemsBadge documentId={metadata.bitemporalDocId} />
      )}
      <Editor
        content={content}
        currentVersionIndex={currentVersionIndex}
        isCurrentVersion={isCurrentVersion}
        onSaveContent={handleSaveContent}
        status={status}
        editorMode={editorMode as EditorMode}
        onNavigateDocument={handleNavigateDocument}
      />
    </div>
  );
}

export const specArtifact = new Artifact<"spec", SpecArtifactMetadata>({
  kind: "spec",
  description:
    "Specification documents stored in the bitemporal documents table. Use for editing rich-text specs with full version history.",

  initialize: async ({ documentId, setMetadata }) => {
    // Initialize metadata with the document ID.
    // The actual SFDT content is loaded via the SWR fetch in artifact.tsx
    // (overridden to use /api/spec-document for spec kind).
    setMetadata({
      isDirty: false,
      bitemporalDocId: documentId,
      isSaving: false,
      editorMode: "view",
    });
  },

  onStreamPart: ({ streamPart, setArtifact, setMetadata }) => {
    if (streamPart.type === "data-specDelta") {
      setArtifact((draftArtifact) => {
        const newContent = draftArtifact.content + streamPart.data;
        return {
          ...draftArtifact,
          content: newContent,
          isVisible: true,
          status: "streaming",
        };
      });
      // Mark document as dirty when AI streams edits (tracked changes)
      setMetadata((prev: SpecArtifactMetadata) => ({
        ...prev,
        isDirty: true,
      }));
    }
  },

  content: ({
    status,
    content,
    isCurrentVersion,
    currentVersionIndex,
    onSaveContent,
    isLoading,
    metadata,
    setMetadata,
    mode,
    getDocumentContentById,
  }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    if (mode === "diff") {
      const oldContent = getDocumentContentById(currentVersionIndex - 1);
      const newContent = getDocumentContentById(currentVersionIndex);

      return <DiffView newContent={newContent} oldContent={oldContent} />;
    }

    /**
     * Wrapper component that uses the useLiveSpecContent hook.
     * We need this inner component because hooks can't be called conditionally.
     */
    return (
      <SpecContentInner
        content={content}
        currentVersionIndex={currentVersionIndex}
        isCurrentVersion={isCurrentVersion}
        metadata={metadata}
        onSaveContent={onSaveContent}
        setMetadata={setMetadata}
        status={status}
      />
    );
  },

  actions: [
    // Toggle between view, WYSIWYG, and raw markdown
    {
      icon: <EyeIcon size={18} />,
      description: "Toggle view / edit mode",
      onClick: ({ metadata, setMetadata }) => {
        const current = metadata?.editorMode ?? "view";
        const next = current === "view" ? "wysiwyg" : current === "wysiwyg" ? "markdown" : "view";
        setMetadata({
          ...metadata,
          editorMode: next,
        });
      },
    },
    // Save button — explicitly saves to bitemporal table
    {
      icon: <SaveIcon size={18} />,
      description: "Save to database",
      onClick: async ({ content, metadata, setMetadata }) => {
        if (!metadata?.bitemporalDocId) {
          toast.error("No document ID available for saving.");
          return;
        }

        if (metadata.isSaving) {
          return;
        }

        setMetadata((prev) => ({ ...prev, isSaving: true }));

        try {
          const response = await fetch(
            `/api/spec-document?id=${metadata.bitemporalDocId}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: "Specification",
                content,
              }),
            }
          );

          if (!response.ok) {
            throw new Error("Failed to save document");
          }

          setMetadata((prev) => ({
            ...prev,
            isDirty: false,
            isSaving: false,
          }));
          toast.success("Document saved successfully!");
        } catch (error) {
          setMetadata((prev) => ({ ...prev, isSaving: false }));
          toast.error("Failed to save document. Please try again.");
          console.error("Save error:", error);
        }
      },
      isDisabled: ({ metadata }) => {
        return metadata?.isSaving || false;
      },
    },
    // Version history actions
    {
      icon: <ClockRewind size={18} />,
      description: "View changes",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("toggle");
      },
      isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
    },
    {
      icon: <UndoIcon size={18} />,
      description: "View Previous version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("prev");
      },
      isDisabled: ({ currentVersionIndex }) => currentVersionIndex === 0,
    },
    {
      icon: <RedoIcon size={18} />,
      description: "View Next version",
      onClick: ({ handleVersionChange }) => {
        handleVersionChange("next");
      },
      isDisabled: ({ isCurrentVersion }) => isCurrentVersion,
    },
    {
      icon: <CopyIcon size={18} />,
      description: "Copy content to clipboard",
      onClick: ({ content }) => {
        navigator.clipboard.writeText(content);
        toast.success("Copied to clipboard!");
      },
    },
  ],

  toolbar: [
    {
      icon: <PenIcon />,
      description: "Add requirements section",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please add a detailed requirements section to this specification document. Include functional requirements, non-functional requirements, and acceptance criteria.",
            },
          ],
        });
      },
    },
    {
      icon: <MessageIcon />,
      description: "Review and suggest improvements",
      onClick: ({ sendMessage }) => {
        sendMessage({
          role: "user",
          parts: [
            {
              type: "text",
              text: "Please review this specification document and suggest improvements for clarity, completeness, and technical accuracy.",
            },
          ],
        });
      },
    },
  ],
});
