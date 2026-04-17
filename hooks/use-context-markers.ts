"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";

export interface ContextMarker {
  /** Marker is rendered after this message ID */
  afterMessageId: string;
  /** Title of the artifact being navigated to, or null if closed */
  title: string | null;
  /** Timestamp for deduplication */
  timestamp: number;
}

const CONTEXT_MARKERS_KEY = "context-markers";

/**
 * Hook for managing context-change markers in the chat.
 * Markers are inserted when the user navigates between artifacts,
 * showing a subtle divider in the message stream.
 */
export function useContextMarkers() {
  const { data: markers, mutate } = useSWR<ContextMarker[]>(
    CONTEXT_MARKERS_KEY,
    null,
    { fallbackData: [] }
  );

  const safeMarkers = markers ?? [];

  /** Add a context-change marker after the given message ID. */
  const addMarker = useCallback(
    (afterMessageId: string, title: string | null) => {
      mutate(
        (current) => {
          const list = current ?? [];
          // Skip duplicate if same message + title already marked
          const last = list[list.length - 1];
          if (
            last &&
            last.afterMessageId === afterMessageId &&
            last.title === title
          ) {
            return list;
          }
          return [
            ...list,
            { afterMessageId, title, timestamp: Date.now() },
          ];
        },
        { revalidate: false }
      );
    },
    [mutate]
  );

  /** Clear all markers (e.g., when starting a new chat). */
  const clearMarkers = useCallback(() => {
    mutate([], { revalidate: false });
  }, [mutate]);

  /** Get markers that should appear after a given message ID. */
  const getMarkersAfter = useCallback(
    (messageId: string): ContextMarker[] => {
      return safeMarkers.filter((m) => m.afterMessageId === messageId);
    },
    [safeMarkers]
  );

  return useMemo(
    () => ({ markers: safeMarkers, addMarker, clearMarkers, getMarkersAfter }),
    [safeMarkers, addMarker, clearMarkers, getMarkersAfter]
  );
}
