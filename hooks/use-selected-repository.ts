"use client";

import { useSelectedProduct } from "./use-selected-product";

const SELECTED_REPOSITORY_KEY = "selected-repository-id";

/**
 * @deprecated Use `useSelectedProduct` instead. This hook is kept for backward
 * compatibility during the migration from repository-scoped to product-scoped filtering.
 */
export function useSelectedRepository() {
  const { selectedProductId, setSelectedProductId } = useSelectedProduct();

  return {
    selectedRepositoryId: selectedProductId,
    setSelectedRepositoryId: setSelectedProductId,
  };
}
