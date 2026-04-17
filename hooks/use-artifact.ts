"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { ArtifactKind, UIArtifact } from "@/components/artifact";

export const initialArtifactData: UIArtifact = {
  documentId: "init",
  content: "",
  kind: "text",
  title: "",
  status: "idle",
  isVisible: false,
  boundingBox: {
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
};

/** Lightweight entry stored in the navigation stack (no content). */
export interface ArtifactStackEntry {
  documentId: string;
  kind: ArtifactKind;
  title: string;
}

const ARTIFACT_STACK_KEY = "artifact-stack";

/**
 * SWR key for storing the live markdown content from the spec editor.
 * This allows the chat input to read the current editor state (including unsaved edits)
 * and send it alongside user messages so the AI always sees the latest document content.
 */
const LIVE_SPEC_CONTENT_KEY = "live-spec-content";

/**
 * Hook to access and update the live spec editor content.
 * The spec editor writes to this on every content change.
 * The chat input reads from this to attach live content to outgoing messages.
 */
export function useLiveSpecContent() {
  const { data: liveContent, mutate: setLiveContent } = useSWR<string | null>(
    LIVE_SPEC_CONTENT_KEY,
    null,
    { fallbackData: null }
  );

  const updateLiveContent = useCallback(
    (content: string | null) => {
      setLiveContent(content, { revalidate: false });
    },
    [setLiveContent]
  );

  return {
    liveSpecContent: liveContent ?? null,
    setLiveSpecContent: updateLiveContent,
  };
}

type Selector<T> = (state: UIArtifact) => T;

export function useArtifactSelector<Selected>(selector: Selector<Selected>) {
  const { data: localArtifact } = useSWR<UIArtifact>("artifact", null, {
    fallbackData: initialArtifactData,
  });

  const selectedValue = useMemo(() => {
    if (!localArtifact) {
      return selector(initialArtifactData);
    }
    return selector(localArtifact);
  }, [localArtifact, selector]);

  return selectedValue;
}

export function useArtifact() {
  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    "artifact",
    null,
    {
      fallbackData: initialArtifactData,
    }
  );

  const { mutate: setLocalStack } = useSWR<ArtifactStackEntry[]>(
    ARTIFACT_STACK_KEY,
    null,
    { fallbackData: [] }
  );

  const artifact = useMemo(() => {
    if (!localArtifact) {
      return initialArtifactData;
    }
    return localArtifact;
  }, [localArtifact]);

  const setArtifact = useCallback(
    (updaterFn: UIArtifact | ((currentArtifact: UIArtifact) => UIArtifact)) => {
      setLocalArtifact((currentArtifact) => {
        const artifactToUpdate = currentArtifact || initialArtifactData;
        const next =
          typeof updaterFn === "function"
            ? updaterFn(artifactToUpdate)
            : updaterFn;

        // Auto-push to stack when navigating to a different artifact
        if (
          next.isVisible &&
          next.documentId !== "init" &&
          next.documentId !== artifactToUpdate.documentId
        ) {
          setLocalStack(
            (stack) => [
              ...(stack || []),
              {
                documentId: next.documentId,
                kind: next.kind,
                title: next.title,
              },
            ],
            { revalidate: false }
          );
        }

        // Auto-clear stack when hiding artifact
        if (!next.isVisible && artifactToUpdate.isVisible) {
          setLocalStack([], { revalidate: false });
        }

        return next;
      });
    },
    [setLocalArtifact, setLocalStack]
  );

  const { data: localArtifactMetadata, mutate: setLocalArtifactMetadata } =
    useSWR<any>(
      () =>
        artifact.documentId ? `artifact-metadata-${artifact.documentId}` : null,
      null,
      {
        fallbackData: null,
      }
    );

  return useMemo(
    () => ({
      artifact,
      setArtifact,
      metadata: localArtifactMetadata,
      setMetadata: setLocalArtifactMetadata,
    }),
    [artifact, setArtifact, localArtifactMetadata, setLocalArtifactMetadata]
  );
}

/**
 * Hook for navigation stack operations on the center content panel.
 * Provides push/pop/popTo/reset/clear and derived state (breadcrumbs, canGoBack).
 */
export function useArtifactStack() {
  const { data: stack, mutate: setLocalStack } = useSWR<ArtifactStackEntry[]>(
    ARTIFACT_STACK_KEY,
    null,
    { fallbackData: [] }
  );

  const { data: localArtifact, mutate: setLocalArtifact } = useSWR<UIArtifact>(
    "artifact",
    null,
    { fallbackData: initialArtifactData }
  );

  const safeStack = stack || [];
  const current = safeStack.length > 0 ? safeStack[safeStack.length - 1] : null;
  const parent =
    safeStack.length > 1 ? safeStack[safeStack.length - 2] : null;
  const canGoBack = safeStack.length > 1;
  const isVisible = safeStack.length > 0;

  /** Open a new artifact on top of the stack (in-content navigation). */
  const push = useCallback(
    (entry: ArtifactStackEntry & Partial<UIArtifact>) => {
      const fullArtifact: UIArtifact = {
        ...initialArtifactData,
        ...entry,
        isVisible: true,
        status: "idle",
      };
      setLocalStack(
        (s) => [...(s || []), { documentId: entry.documentId, kind: entry.kind, title: entry.title }],
        { revalidate: false }
      );
      setLocalArtifact(fullArtifact, { revalidate: false });
    },
    [setLocalStack, setLocalArtifact]
  );

  /** Go back one level. If at root, clears the stack. */
  const pop = useCallback(() => {
    setLocalStack(
      (s) => {
        const currentStack = s || [];
        if (currentStack.length <= 1) {
          // At root or empty — close
          setLocalArtifact(
            { ...initialArtifactData, status: "idle" },
            { revalidate: false }
          );
          return [];
        }
        const newStack = currentStack.slice(0, -1);
        const prev = newStack[newStack.length - 1];
        // Restore the parent artifact — content will be re-fetched by artifact.tsx
        setLocalArtifact(
          (current) => ({
            ...(current || initialArtifactData),
            documentId: prev.documentId,
            kind: prev.kind,
            title: prev.title,
            content: "",
            status: "idle",
            isVisible: true,
          }),
          { revalidate: false }
        );
        return newStack;
      },
      { revalidate: false }
    );
  }, [setLocalStack, setLocalArtifact]);

  /** Jump to a specific breadcrumb index, dropping everything after it. */
  const popTo = useCallback(
    (index: number) => {
      setLocalStack(
        (s) => {
          const currentStack = s || [];
          if (index < 0 || index >= currentStack.length) return currentStack;
          const newStack = currentStack.slice(0, index + 1);
          const target = newStack[newStack.length - 1];
          setLocalArtifact(
            (current) => ({
              ...(current || initialArtifactData),
              documentId: target.documentId,
              kind: target.kind,
              title: target.title,
              content: "",
              status: "idle",
              isVisible: true,
            }),
            { revalidate: false }
          );
          return newStack;
        },
        { revalidate: false }
      );
    },
    [setLocalStack, setLocalArtifact]
  );

  /** Clear stack and start fresh with a single artifact (sidebar click). */
  const reset = useCallback(
    (entry: ArtifactStackEntry & Partial<UIArtifact>) => {
      const fullArtifact: UIArtifact = {
        ...initialArtifactData,
        ...entry,
        isVisible: true,
        status: "idle",
      };
      setLocalStack(
        [{ documentId: entry.documentId, kind: entry.kind, title: entry.title }],
        { revalidate: false }
      );
      setLocalArtifact(fullArtifact, { revalidate: false });
    },
    [setLocalStack, setLocalArtifact]
  );

  /** Close all artifacts and hide the center panel. */
  const clear = useCallback(() => {
    setLocalStack([], { revalidate: false });
    setLocalArtifact(
      { ...initialArtifactData, status: "idle" },
      { revalidate: false }
    );
  }, [setLocalStack, setLocalArtifact]);

  return useMemo(
    () => ({
      stack: safeStack,
      current,
      parent,
      canGoBack,
      isVisible,
      push,
      pop,
      popTo,
      reset,
      clear,
    }),
    [safeStack, current, parent, canGoBack, isVisible, push, pop, popTo, reset, clear]
  );
}
