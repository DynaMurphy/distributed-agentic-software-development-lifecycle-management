"use client";

import { memo, useCallback, useState } from "react";
import { toast } from "sonner";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";

interface Suggestion {
  id: string;
  title: string;
  relevanceScore: number;
  suggestedLinkType: string;
  reason: string;
}

interface SuggestLinksResultProps {
  output: {
    itemType: string;
    itemId: string;
    title?: string;
    suggestions: Suggestion[];
    existingLinks?: Array<{
      linkId: string;
      documentId: string;
      linkType: string;
    }>;
    message?: string;
  };
  isReadonly: boolean;
}

function PureSuggestLinksResult({
  output,
  isReadonly,
}: SuggestLinksResultProps) {
  const { setArtifact } = useArtifact();
  const { itemType, itemId, suggestions, message } = output;
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<string | null>(null);

  const openSpec = useCallback(
    (specId: string, specTitle: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: specId,
        kind: "spec" as ArtifactKind,
        title: specTitle,
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [setArtifact]
  );

  const acceptSuggestion = useCallback(
    async (suggestion: Suggestion) => {
      setLoading(suggestion.id);
      try {
        const res = await fetch("/api/ai-tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: "acceptSuggestion",
            itemType,
            itemId,
            documentId: suggestion.id,
            linkType: suggestion.suggestedLinkType,
          }),
        });

        const data = await res.json();
        if (!res.ok || data.error) {
          toast.error(data.error ?? "Failed to link document.");
          return;
        }

        setAccepted((prev) => new Set(prev).add(suggestion.id));
        toast.success(`Linked "${suggestion.title}" successfully.`);
      } catch (err) {
        toast.error(`Network error: ${String(err)}`);
      } finally {
        setLoading(null);
      }
    },
    [itemType, itemId]
  );

  const dismissSuggestion = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  const visible = suggestions.filter(
    (s) => !dismissed.has(s.id) && !accepted.has(s.id)
  );

  return (
    <div className="w-full max-w-md rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>🔗</span>
        <span>
          Suggested Links{output.title ? ` for "${output.title}"` : ""}
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {accepted.size > 0
            ? "All suggestions have been processed."
            : message ?? "No relevant documents found."}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <div
              className="rounded-lg border p-2.5 text-xs space-y-1.5"
              key={s.id}
            >
              <div className="flex items-center justify-between">
                <button
                  className="font-medium hover:underline text-left truncate"
                  onClick={() => openSpec(s.id, s.title)}
                  type="button"
                >
                  📝 {s.title}
                </button>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400 font-medium">
                    {s.relevanceScore}%
                  </span>
                  <span className="px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {s.suggestedLinkType.replace("_", " ")}
                  </span>
                </div>
              </div>
              {s.reason && (
                <p className="text-muted-foreground">{s.reason}</p>
              )}
              {!isReadonly && (
                <div className="flex gap-2 pt-1">
                  <button
                    className="px-2 py-1 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    disabled={loading === s.id}
                    onClick={() => acceptSuggestion(s)}
                    type="button"
                  >
                    {loading === s.id ? "Linking…" : "Accept"}
                  </button>
                  <button
                    className="px-2 py-1 rounded-md border text-xs hover:bg-muted transition-colors"
                    onClick={() => dismissSuggestion(s.id)}
                    type="button"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {accepted.size > 0 && (
        <p className="text-xs text-green-600 dark:text-green-400 border-t pt-2">
          ✓ {accepted.size} document(s) linked
        </p>
      )}
    </div>
  );
}

export const SuggestLinksResult = memo(PureSuggestLinksResult, () => true);
