"use client";

import dynamic from "next/dynamic";
import type { Suggestion } from "@/lib/db/schema";

/**
 * Dynamic import of the Syncfusion editor with SSR disabled.
 * Syncfusion Document Editor requires browser APIs (DOM, window)
 * and cannot be rendered on the server.
 */
const SyncfusionEditorDynamic = dynamic(
  () =>
    import("./syncfusion-editor").then((mod) => mod.SyncfusionEditor),
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

type EditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Suggestion[];
};

/**
 * The text editor component used by the artifact system.
 * Wraps SyncfusionEditor with dynamic import (no SSR).
 *
 * This component satisfies the same interface as the original
 * ProseMirror-based Editor component.
 */
export function Editor(props: EditorProps) {
  return <SyncfusionEditorDynamic {...props} />;
}
