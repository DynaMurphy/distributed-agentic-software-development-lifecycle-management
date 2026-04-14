"use client";

import dynamic from "next/dynamic";

/**
 * Dynamic import of the Milkdown editor with SSR disabled.
 * Milkdown/ProseMirror requires browser APIs (DOM, window)
 * and cannot be rendered on the server.
 */
const MilkdownEditorDynamic = dynamic(
  () =>
    import("./milkdown-editor").then((mod) => mod.MilkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full min-h-[600px] bg-muted/30 rounded-lg">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm">Loading document editor...</span>
        </div>
      </div>
    ),
  }
);

const RawMarkdownEditorDynamic = dynamic(
  () =>
    import("./raw-markdown-editor").then((mod) => mod.RawMarkdownEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full min-h-[600px] bg-muted/30 rounded-lg">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          <span className="text-sm">Loading markdown editor...</span>
        </div>
      </div>
    ),
  }
);

export type EditorMode = "wysiwyg" | "markdown";

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  editorMode?: EditorMode;
  onNavigateDocument?: (docId: string, linkText: string) => void;
};

/**
 * The text editor component used by the artifact system.
 * Renders either the Milkdown WYSIWYG editor or a raw CodeMirror markdown editor.
 */
export function Editor({ editorMode = "wysiwyg", ...props }: EditorProps) {
  if (editorMode === "markdown") {
    return <RawMarkdownEditorDynamic {...props} />;
  }
  return <MilkdownEditorDynamic {...props} />;
}
