"use client";

import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { memo, useEffect, useRef } from "react";

/** Override CodeMirror's default monospace font to match the app's Geist font */
const appFontTheme = EditorView.theme({
  "&": {
    fontFamily: "var(--font-geist), sans-serif",
  },
  ".cm-content": {
    fontFamily: "var(--font-geist), sans-serif",
  },
  ".cm-gutters": {
    fontFamily: "var(--font-geist), sans-serif",
  },
});

type RawMarkdownEditorProps = {
  content: string;
  onSaveContent: (updatedContent: string, debounce: boolean) => void;
  status: "streaming" | "idle";
  isCurrentVersion: boolean;
  currentVersionIndex: number;
  readOnly?: boolean;
};

function PureRawMarkdownEditor({
  content,
  onSaveContent,
  status,
  isCurrentVersion,
  readOnly = false,
}: RawMarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const onSaveContentRef = useRef(onSaveContent);
  const isCurrentVersionRef = useRef(isCurrentVersion);
  onSaveContentRef.current = onSaveContent;
  isCurrentVersionRef.current = isCurrentVersion;

  // Initialize CodeMirror
  useEffect(() => {
    if (!containerRef.current || editorRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const transaction = update.transactions.find(
          (tr) => !tr.annotation(Transaction.remote),
        );
        if (transaction && isCurrentVersionRef.current) {
          const newContent = update.state.doc.toString();
          onSaveContentRef.current(newContent, true);
        }
      }
    });

    const startState = EditorState.create({
      doc: content,
      extensions: [
        basicSetup,
        markdown(),
        oneDark,
        appFontTheme,
        EditorView.lineWrapping,
        readOnlyCompartment.current.of(
          EditorState.readOnly.of(readOnly || !isCurrentVersion),
        ),
        updateListener,
      ],
    });

    editorRef.current = new EditorView({
      state: startState,
      parent: containerRef.current,
    });

    return () => {
      if (editorRef.current) {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update readOnly state
  useEffect(() => {
    if (!editorRef.current) return;
    const isReadOnly = readOnly || !isCurrentVersion;
    editorRef.current.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(isReadOnly),
      ),
    });
  }, [readOnly, isCurrentVersion]);

  // Sync external content changes (streaming, version switches, etc.)
  useEffect(() => {
    if (!editorRef.current || !content) return;

    const currentContent = editorRef.current.state.doc.toString();
    if (currentContent !== content) {
      const transaction = editorRef.current.state.update({
        changes: {
          from: 0,
          to: currentContent.length,
          insert: content,
        },
        annotations: [Transaction.remote.of(true)],
      });
      editorRef.current.dispatch(transaction);
    }
  }, [content, status]);

  return (
    <div
      ref={containerRef}
      className="not-prose relative w-full min-h-[600px] text-sm"
    />
  );
}

export const RawMarkdownEditor = memo(PureRawMarkdownEditor);
