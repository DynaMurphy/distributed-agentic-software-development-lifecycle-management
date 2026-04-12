"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

type AIToolName =
  | "triage"
  | "detectDuplicates"
  | "analyzeImpact"
  | "suggestDocumentLinks"
  | "acceptSuggestion"
  | "aiDesign"
  | "aiImplement"
  | "aiTesting"
  | "aiSignoff";

interface AIToolActionOptions {
  /** Callback to refresh the artifact content after the tool completes */
  onSuccess?: (result: Record<string, unknown>) => void;
  /** Custom toast message on success */
  successMessage?: string;
}

/**
 * Hook to call AI tools via the /api/ai-tools route from artifact UIs.
 * Returns `execute` function and loading/error/result state.
 */
export function useAIToolAction(options?: AIToolActionOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const execute = useCallback(
    async (
      tool: AIToolName,
      params: {
        itemType: string;
        itemId: string;
        documentId?: string;
        linkType?: string;
      }
    ) => {
      setIsLoading(true);
      setError(null);
      setResult(null);

      try {
        const res = await fetch("/api/ai-tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tool, ...params }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          const errMsg = data.error ?? `AI tool failed (${res.status})`;
          setError(errMsg);
          toast.error(errMsg);
          return null;
        }

        setResult(data);
        if (options?.successMessage) {
          toast.success(options.successMessage);
        }
        options?.onSuccess?.(data);
        return data;
      } catch (err) {
        const errMsg = `Network error: ${String(err)}`;
        setError(errMsg);
        toast.error(errMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [options]
  );

  return { execute, isLoading, error, result };
}
