"use client";

import { Crepe } from "@milkdown/crepe";
import { replaceAll } from "@milkdown/kit/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";

import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

type MilkdownFieldEditorProps = {
  /** Initial/current markdown content */
  content: string;
  /** Called when the user changes content (on blur or after edits) */
  onChange: (value: string) => void;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Minimum height CSS value */
  minHeight?: string;
};

/**
 * A lightweight Milkdown editor for form fields.
 * Disables heavy features (CodeMirror, Mermaid, ImageBlock, Latex) and
 * uses a simplified toolbar suitable for description fields.
 */
function PureMilkdownFieldEditor({
  content,
  onChange,
  readOnly = false,
  placeholder = "Start writing...",
  minHeight = "120px",
}: MilkdownFieldEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const crepeRef = useRef<Crepe | null>(null);
  const isLoadingContentRef = useRef(false);
  const lastContentRef = useRef<string>("");
  const [editorReady, setEditorReady] = useState(false);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const contentRef = useRef(content);
  contentRef.current = content;

  /**
   * Safely replace editor content. Uses requestAnimationFrame to ensure
   * the ProseMirror view is settled before calling replaceAll, which
   * prevents "Selection passed to setSelection must point at the current
   * document" errors.
   */
  const safeReplaceAll = useCallback(
    (crepe: Crepe, markdown: string, label: string) => {
      if (markdown === lastContentRef.current) return;
      isLoadingContentRef.current = true;
      lastContentRef.current = markdown;

      requestAnimationFrame(() => {
        try {
          crepe.editor.action(replaceAll(markdown));
        } catch (e) {
          console.warn(`[MilkdownFieldEditor] replaceAll failed (${label}):`, e);
        }
        // Keep loading flag for 350ms so the debounced markdownUpdated
        // (200ms) fires while loading is still true and gets suppressed.
        setTimeout(() => {
          isLoadingContentRef.current = false;
        }, 350);
      });
    },
    [],
  );

  // ---------------------------------------------------------------------------
  // Initialize and destroy the Crepe editor.
  // Uses isolated DOM per mount + delayed destroy (see milkdown-lifecycle.md).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editorRoot = document.createElement("div");
    editorRoot.setAttribute("data-milkdown-field", "");
    container.appendChild(editorRoot);

    let aborted = false;
    setEditorReady(false);

    const buildCrepe = (root: HTMLElement): Crepe => {
      const instance = new Crepe({
        root,
        // defaultValue handles the initial content — no replaceAll needed
        defaultValue: contentRef.current || "",
        features: {
          [Crepe.Feature.Toolbar]: true,
          [Crepe.Feature.BlockEdit]: true,
          [Crepe.Feature.Placeholder]: true,
          [Crepe.Feature.ListItem]: true,
          [Crepe.Feature.LinkTooltip]: true,
          [Crepe.Feature.Table]: false,
          [Crepe.Feature.CodeMirror]: false,
          [Crepe.Feature.Cursor]: true,
          [Crepe.Feature.ImageBlock]: false,
          [Crepe.Feature.Latex]: false,
          [Crepe.Feature.TopBar]: false,
        },
        featureConfigs: {
          [Crepe.Feature.Placeholder]: {
            text: placeholder,
            mode: "doc",
          },
        },
      });

      instance.on((listener) => {
        listener.markdownUpdated((_ctx, markdown, _prevMarkdown) => {
          if (aborted || isLoadingContentRef.current) return;
          if (markdown !== lastContentRef.current) {
            lastContentRef.current = markdown;
            onChangeRef.current(markdown);
          }
        });
      });

      return instance;
    };

    const finalizeCreation = (instance: Crepe) => {
      if (aborted) return;
      crepeRef.current = instance;

      // Record what defaultValue loaded; do NOT call replaceAll here —
      // the editor already has the content from defaultValue.
      lastContentRef.current = contentRef.current || "";

      if (readOnly) {
        try {
          instance.setReadonly(true);
        } catch {
          /* noop */
        }
      }

      setEditorReady(true);
    };

    const crepe = buildCrepe(editorRoot);
    let activeCrepe = crepe;

    const createPromise = crepe
      .create()
      .then(() => finalizeCreation(crepe))
      .catch((e) => {
        console.warn("[MilkdownFieldEditor] create() failed, retrying:", e);
        if (aborted) return;
        editorRoot.innerHTML = "";

        const retryCrepe = buildCrepe(editorRoot);
        activeCrepe = retryCrepe;
        return retryCrepe
          .create()
          .then(() => finalizeCreation(retryCrepe))
          .catch((e2) => {
            console.error("[MilkdownFieldEditor] retry also failed:", e2);
          });
      });

    return () => {
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
      crepeRef.current.setReadonly(readOnly);
    } catch {
      /* noop */
    }
  }, [readOnly, editorReady]);

  // Load content when it changes from an external source.
  useEffect(() => {
    if (!editorReady || !crepeRef.current) return;
    if (content && content !== lastContentRef.current) {
      safeReplaceAll(crepeRef.current, content, "content-update");
    }
  }, [content, editorReady, safeReplaceAll]);

  return (
    <div
      ref={containerRef}
      className="milkdown-field-editor rounded-md border bg-background focus-within:ring-1 focus-within:ring-primary/20"
      style={{ minHeight }}
    />
  );
}

export const MilkdownFieldEditor = memo(PureMilkdownFieldEditor);
