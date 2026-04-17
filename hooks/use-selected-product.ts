"use client";

import { useCallback, useEffect, useRef } from "react";
import useSWR from "swr";

const SELECTED_PRODUCT_KEY = "selected-product-id";
const SESSION_STORAGE_KEY = "selected-product-id";

/**
 * Shared hook for the currently selected product ID.
 * Used by the sidebar selector and artifact components (backlog, specs, etc.)
 * to filter data by product. Persisted to sessionStorage so it survives
 * page refreshes within the same browser session.
 *
 * Returns "" when "All Products" is selected.
 */
export function useSelectedProduct() {
  const hydratedRef = useRef(false);
  const { data: selectedProductId, mutate } = useSWR<string>(
    SELECTED_PRODUCT_KEY,
    null,
    { fallbackData: "" }
  );

  // Hydrate from sessionStorage after mount to avoid SSR mismatch
  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored) {
        mutate(stored, { revalidate: false });
      }
    }
  }, [mutate]);

  const setSelectedProductId = useCallback(
    (id: string) => {
      if (typeof window !== "undefined") {
        sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      }
      mutate(id, { revalidate: false });
    },
    [mutate]
  );

  return {
    selectedProductId: selectedProductId ?? "",
    setSelectedProductId,
  };
}
