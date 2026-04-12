"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import type { UIArtifact } from "@/components/artifact";

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

        if (typeof updaterFn === "function") {
          return updaterFn(artifactToUpdate);
        }

        return updaterFn;
      });
    },
    [setLocalArtifact]
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
