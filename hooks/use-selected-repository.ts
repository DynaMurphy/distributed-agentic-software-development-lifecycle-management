"use client";

import { useCallback } from "react";
import useSWR from "swr";

const SELECTED_REPOSITORY_KEY = "selected-repository-id";

/**
 * Shared hook for the currently selected repository ID.
 * Used by the sidebar selector and artifact components (backlog, specs, etc.)
 * to filter data by repository.
 *
 * Returns "" when "All Repositories" is selected.
 */
export function useSelectedRepository() {
  const { data: selectedRepositoryId, mutate } = useSWR<string>(
    SELECTED_REPOSITORY_KEY,
    null,
    { fallbackData: "" }
  );

  const setSelectedRepositoryId = useCallback(
    (id: string) => {
      mutate(id, { revalidate: false });
    },
    [mutate]
  );

  return {
    selectedRepositoryId: selectedRepositoryId ?? "",
    setSelectedRepositoryId,
  };
}
