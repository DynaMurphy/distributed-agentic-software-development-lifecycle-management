"use client";

import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

import { mermaidFeature } from "@/lib/editor/mermaid-plugin";

type MilkdownEditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  readOnly?: boolean;
};

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

function PureMilkdownEditor({
  content,
  onSaveContent,
  status,
  isCurrentVersion,
  readOnly = false,
}: MilkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isLoadingContentRef = useRef(false);
  const lastContentRef = useRef<string>("");
  const [editorReady, setEditorReady] = useState(false);

  // Refs for values used inside the listener closure
  const onSaveContentRef = useRef(onSaveContent);
  const isCurrentVersionRef = useRef(isCurrentVersion);
  const contentRef = useRef(content);
  onSaveContentRef.current = onSaveContent;
  isCurrentVersionRef.current = isCurrentVersion;
  contentRef.current = content;

  const throttledContent = useThrottle(content, 500);

  /**
   * Helper: load markdown into the editor and suppress the resulting
   * markdownUpdated callback (debounced 200ms) so it doesn't trigger a save.
   */
  const loadContentIntoEditor = useCallback(
    (crepe: Crepe, markdown: string, label: string) => {
      if (!markdown || markdown === lastContentRef.current) return;
      //console.log(`[MilkdownEditor] loadContent (${label}):`, markdown.substring(0, 80));
      isLoadingContentRef.current = true;
      try {
        crepe.editor.action(replaceAll(markdown));
        lastContentRef.current = markdown;
      } catch (e) {
        console.warn(`[MilkdownEditor] replaceAll failed (${label}):`, e);
      }
      // Keep loading flag for 350ms so the debounced markdownUpdated (200ms)
      // fires while loading is still true and gets suppressed.
      setTimeout(() => {
        isLoadingContentRef.current = false;
      }, 350);
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Initialize and destroy the Crepe editor.
  //
  // CRITICAL DESIGN:
  // 1. Each effect invocation creates its own child <div> inside the container
  //    and passes THAT as Crepe's root.  This guarantees DOM isolation in React
  //    StrictMode (mount→unmount→mount with the same containerRef.current) and
  //    prevents two concurrent Crepe/ProseMirror instances from interfering.
  //
  // 2. On cleanup we IMMEDIATELY detach the child <div> so the user never sees
  //    stale content.  We do NOT call destroy() right away because Milkdown
  //    features (Toolbar, BlockEdit, LinkTooltip) use lodash-throttle(200ms),
  //    debounce(20ms), and requestAnimationFrame callbacks that access
  //    ctx.get(editorViewCtx).  If destroy() removes that slice before the
  //    callbacks flush, it throws "Context editorView not found".
  //
  // 3. After a 1-second delay (well beyond the longest 200ms throttle/debounce)
  //    we call destroy() to properly release resources.  By then all async
  //    callbacks have fired harmlessly (DOM is detached so they're no-ops).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Each mount gets its own isolated root div.
    const editorRoot = document.createElement("div");
    editorRoot.setAttribute("data-milkdown-root", "");
    container.appendChild(editorRoot);

    let aborted = false;
    setEditorReady(false);
    //console.log("[MilkdownEditor] Creating editor, initial content length:", contentRef.current?.length ?? 0);

    // Helper to finalize a successfully created editor instance.
    const finalizeCreation = (instance: Crepe) => {
      if (aborted) return;
      //console.log("[MilkdownEditor] Editor created, contentRef length:", contentRef.current?.length ?? 0);
      crepeRef.current = instance;

      // Load the latest content via ref (the prop may have changed while
      // create() was resolving, e.g. SWR loaded the document).
      const initialContent = contentRef.current || "";
      lastContentRef.current = initialContent;

      if (initialContent.trim()) {
        isLoadingContentRef.current = true;
        try {
          instance.editor.action(replaceAll(initialContent));
        } catch (e) {
          //console.warn("[MilkdownEditor] replaceAll failed on init:", e);
        }
        setTimeout(() => {
          isLoadingContentRef.current = false;
        }, 350);
      }

      if (readOnly || !isCurrentVersion) {
        try {
          instance.setReadonly(true);
        } catch {
          /* noop */
        }
      }

      setEditorReady(true);
    };

    // Create a fresh Crepe instance.  Used for initial creation and retries.
    const buildCrepe = (root: HTMLElement): Crepe => {
      const instance = new Crepe({
        root,
        defaultValue: contentRef.current || "",
        features: {
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.Placeholder]: true,
          [Crepe.Feature.ListItem]: true,
          [Crepe.Feature.LinkTooltip]: true,
          [Crepe.Feature.Table]: true,
          [Crepe.Feature.CodeMirror]: true,
          [Crepe.Feature.Cursor]: true,
          [Crepe.Feature.ImageBlock]: false,
          [Crepe.Feature.Latex]: false,
          [Crepe.Feature.TopBar]: false,
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: "Start writing your document...",
            mode: "doc",
          },
        },
      });

      instance.addFeature(mermaidFeature);

      instance.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
          if (aborted || isLoadingContentRef.current) return;
          if (!isCurrentVersionRef.current) return;
          if (markdown !== lastContentRef.current) {
            lastContentRef.current = markdown;
            onSaveContentRef.current(markdown, true);
          }
        });
      });

      return instance;
    };

    // Attempt to create the editor, retrying once with a fresh DOM node and
    // Crepe instance if the first attempt fails (works around ProseMirror
    // DecorationGroup state corruption after a prior destroy cycle).
    const crepe = buildCrepe(editorRoot);
    let activeCrepe = crepe;
    const createPromise = crepe
      .create()
      .then(() => finalizeCreation(crepe))
      .catch((e) => {
        console.warn("[MilkdownEditor] create() failed, retrying with fresh instance:", e);
        if (aborted) return;

        // Tear down the failed DOM and build a fresh root + Crepe.
        editorRoot.innerHTML = "";

        const retryCrepe = buildCrepe(editorRoot);
        activeCrepe = retryCrepe;
        return retryCrepe
          .create()
          .then(() => finalizeCreation(retryCrepe))
          .catch((e2) => {
            console.error("[MilkdownEditor] create() retry also failed:", e2);
          });
      });

    return () => {
      //console.log("[MilkdownEditor] Cleanup");
      aborted = true;
      crepeRef.current = null;
      setEditorReady(false);

      editorRoot.remove();

      const crepeToDestroy = activeCrepe;
      setTimeout(() => {
        createPromise
          .then(() => {
            crepeToDestroy.destroy().catch(() => {});
          })
          .catch(() => {});
      }, 1000);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update readonly state when props change.
  useEffect(() => {
    if (!editorReady || !crepeRef.current) return;
    try {
      crepeRef.current.setReadonly(readOnly || !isCurrentVersion);
    } catch {
      /* noop */
    }
  }, [readOnly, isCurrentVersion, editorReady]);

  // ---------------------------------------------------------------------------
  // Load content when it changes from an external source (SWR, streaming, etc.)
  // This is the SINGLE code path for external content updates.
  // Fires when: content prop changes, editorReady transitions to true, or
  // status changes.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editorReady || !crepeRef.current) {
      //console.log("[MilkdownEditor] content effect skipped: editorReady=", editorReady, "crepe=", !!crepeRef.current);
      return;
    }

    const target =
      status === "streaming" ? throttledContent : content;

    if (target && target !== lastContentRef.current) {
      //console.log("[MilkdownEditor] content effect loading, status=", status, "length=", target.length);
      loadContentIntoEditor(crepeRef.current, target, "content-effect");
    }
  }, [content, throttledContent, status, editorReady, loadContentIntoEditor]);

  // When streaming finishes, do a final load with the complete content.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    if (!editorReady || !crepeRef.current) return;
    if (prevStatusRef.current === "streaming" && status === "idle" && content) {
      loadContentIntoEditor(crepeRef.current, content, "stream-finish");
    }
    prevStatusRef.current = status;
  }, [status, content, editorReady, loadContentIntoEditor]);

  return (
    <div
      ref={containerRef}
      className="milkdown-editor-wrapper prose prose-sm dark:prose-invert max-w-none"
    />
  );
}

export const MilkdownEditor = memo(PureMilkdownEditor);
