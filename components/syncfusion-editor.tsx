"use client";

import {
  DocumentEditorContainerComponent,
  Toolbar,
} from "@syncfusion/ej2-react-documenteditor";
import { registerLicense } from "@syncfusion/ej2-base";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { Suggestion } from "@/lib/db/schema";
import { markdownToSfdt, sfdtToMarkdown } from "@/lib/sfdt";

// Register Syncfusion license
registerLicense(
  "Ngo9BigBOggjHTQxAR8/V1JGaF5cXGpCf1FpRmJGdld5fUVHYVZUTXxaS00DNHVRdkdlWX5ccnRTRGNfUENzWEZWYEs="
);

// Inject the Toolbar module
DocumentEditorContainerComponent.Inject(Toolbar);

/* ------------------------------------------------------------------ */
/*  CSS import for Syncfusion Material theme                           */
/* ------------------------------------------------------------------ */
import "@syncfusion/ej2-base/styles/material.css";
import "@syncfusion/ej2-buttons/styles/material.css";
import "@syncfusion/ej2-inputs/styles/material.css";
import "@syncfusion/ej2-popups/styles/material.css";
import "@syncfusion/ej2-lists/styles/material.css";
import "@syncfusion/ej2-navigations/styles/material.css";
import "@syncfusion/ej2-splitbuttons/styles/material.css";
import "@syncfusion/ej2-dropdowns/styles/material.css";
import "@syncfusion/ej2-react-documenteditor/styles/material.css";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type SyncfusionEditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  suggestions: Suggestion[];
};

/* ------------------------------------------------------------------ */
/*  Throttle utility                                                   */
/* ------------------------------------------------------------------ */

function useThrottle<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState(value);
  const lastUpdated = useRef(Date.now());

  useEffect(() => {
    const now = Date.now();
    if (now - lastUpdated.current >= intervalMs) {
      lastUpdated.current = now;
      setThrottled(value);
    } else {
      const timerId = setTimeout(() => {
        lastUpdated.current = Date.now();
        setThrottled(value);
      }, intervalMs - (now - lastUpdated.current));
      return () => clearTimeout(timerId);
    }
  }, [value, intervalMs]);

  return throttled;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

function PureSyncfusionEditor({
  content,
  onSaveContent,
  status,
  isCurrentVersion,
  suggestions: _suggestions,
}: SyncfusionEditorProps) {
  const containerRef = useRef<DocumentEditorContainerComponent | null>(null);
  const isLoadingRef = useRef(false);
  const lastContentRef = useRef<string>("");

  // Throttle streaming content updates to ~500ms to avoid flicker
  const throttledContent = useThrottle(content, 500);

  /**
   * Load markdown content into the Syncfusion editor by converting to SFDT.
   */
  const loadContent = useCallback((markdown: string) => {
    if (!containerRef.current?.documentEditor) return;
    if (!markdown && !markdown.trim()) return;

    try {
      isLoadingRef.current = true;
      const sfdt = markdownToSfdt(markdown);
      containerRef.current.documentEditor.open(JSON.stringify(sfdt));
      lastContentRef.current = markdown;
    } catch (err) {
      console.error("Failed to load content into Syncfusion editor:", err);
    } finally {
      isLoadingRef.current = false;
    }
  }, []);

  /**
   * Handle content changes from the Syncfusion editor.
   * Serialize SFDT back to markdown and call onSaveContent.
   */
  const handleContentChange = useCallback(() => {
    if (isLoadingRef.current) return;
    if (!containerRef.current?.documentEditor) return;
    if (!isCurrentVersion) return;

    try {
      const sfdtString = containerRef.current.documentEditor.serialize();
      const sfdtObj = JSON.parse(sfdtString);
      const markdown = sfdtToMarkdown(sfdtObj);

      if (markdown !== lastContentRef.current) {
        lastContentRef.current = markdown;
        onSaveContent(markdown, true);
      }
    } catch (err) {
      console.error("Failed to serialize editor content:", err);
    }
  }, [onSaveContent, isCurrentVersion]);

  /**
   * Load initial content or update when content changes while not streaming.
   */
  useEffect(() => {
    if (status === "idle" && content && content !== lastContentRef.current) {
      loadContent(content);
    }
  }, [content, status, loadContent]);

  /**
   * During streaming: update editor with throttled content.
   */
  useEffect(() => {
    if (status === "streaming" && throttledContent) {
      loadContent(throttledContent);
    }
  }, [throttledContent, status, loadContent]);

  /**
   * When streaming finishes, do a final load with the complete content.
   */
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (prevStatusRef.current === "streaming" && status === "idle" && content) {
      loadContent(content);
    }
    prevStatusRef.current = status;
  }, [status, content, loadContent]);

  return (
    <div className="syncfusion-editor-wrapper w-full h-full min-h-[600px]">
      <DocumentEditorContainerComponent
        ref={containerRef}
        enableToolbar={isCurrentVersion}
        showPropertiesPane={false}
        serviceUrl="https://ej2services.syncfusion.com/production/web-services/api/documenteditor/"
        height="100%"
        contentChange={handleContentChange}
        style={{
          width: "100%",
          height: "100%",
          minHeight: "600px",
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Memoization                                                        */
/* ------------------------------------------------------------------ */

function areEqual(
  prevProps: SyncfusionEditorProps,
  nextProps: SyncfusionEditorProps
) {
  return (
    prevProps.suggestions === nextProps.suggestions &&
    prevProps.currentVersionIndex === nextProps.currentVersionIndex &&
    prevProps.isCurrentVersion === nextProps.isCurrentVersion &&
    !(prevProps.status === "streaming" && nextProps.status === "streaming") &&
    prevProps.content === nextProps.content &&
    prevProps.onSaveContent === nextProps.onSaveContent
  );
}

export const SyncfusionEditor = memo(PureSyncfusionEditor, areEqual);
