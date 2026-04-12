"use client";

import { memo, useCallback } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";

interface DuplicateCandidate {
  id: string;
  title: string;
  similarityScore: number;
  reason: string;
}

interface DuplicateResultProps {
  output: {
    itemType: string;
    itemId: string;
    title?: string;
    duplicates: DuplicateCandidate[];
    message?: string;
  };
  isReadonly: boolean;
}

function scoreColor(score: number): string {
  if (score >= 80) return "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400";
  if (score >= 60) return "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400";
  return "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400";
}

function PureDuplicateResult({ output, isReadonly }: DuplicateResultProps) {
  const { setArtifact } = useArtifact();
  const { itemType, duplicates, message } = output;

  const openItem = useCallback(
    (id: string, title: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: id,
        kind: itemType as ArtifactKind,
        title,
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [itemType, setArtifact]
  );

  return (
    <div className="w-full max-w-md rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>🔍</span>
        <span>
          Duplicate Check{output.title ? `: ${output.title}` : ""}
        </span>
      </div>

      {duplicates.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {message ?? "No duplicates found."}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Found {duplicates.length} potential duplicate(s):
          </p>
          {duplicates.map((d) => (
            <button
              className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs hover:bg-muted/50 transition-colors"
              key={d.id}
              onClick={() => openItem(d.id, d.title)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{d.title}</div>
                {d.reason && (
                  <div className="text-muted-foreground truncate mt-0.5">
                    {d.reason}
                  </div>
                )}
              </div>
              <span
                className={`ml-2 shrink-0 px-1.5 py-0.5 rounded-full font-medium ${scoreColor(
                  d.similarityScore
                )}`}
              >
                {d.similarityScore}%
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const DuplicateResult = memo(PureDuplicateResult, () => true);
