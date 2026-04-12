"use client";

import { memo, useCallback } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";
import { SparklesIcon } from "@/components/icons";

interface TriageData {
  suggestedPriority?: string;
  suggestedEffort?: string;
  rationale?: string;
  riskLevel?: string;
  suggestedSprint?: string;
  rawAssessment?: string;
}

interface TriageResultProps {
  output: {
    itemType: string;
    itemId: string;
    title: string;
    triage: TriageData;
  };
  isReadonly: boolean;
}

const riskColors: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  medium:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  low: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  medium:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  low: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
};

function PureTriageResult({ output, isReadonly }: TriageResultProps) {
  const { setArtifact } = useArtifact();
  const { itemType, itemId, title, triage } = output;

  const handleClick = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      documentId: itemId,
      kind: itemType as ArtifactKind,
      title,
      content: "",
      isVisible: true,
      status: "idle",
    }));
  }, [itemType, itemId, title, setArtifact]);

  return (
    <div className="w-full max-w-md rounded-xl border bg-background p-4 space-y-3">
      <button
        className="flex items-center gap-2 text-left w-full group"
        onClick={handleClick}
        type="button"
      >
        <SparklesIcon size={16} />
        <span className="font-medium text-sm group-hover:underline">
          Triage: {title}
        </span>
      </button>

      <div className="grid grid-cols-2 gap-2 text-xs">
        {triage.suggestedPriority && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Priority:</span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${
                priorityColors[triage.suggestedPriority] ?? ""
              }`}
            >
              {triage.suggestedPriority}
            </span>
          </div>
        )}
        {triage.suggestedEffort && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Effort:</span>
            <span className="font-medium px-1.5 py-0.5 rounded-full bg-muted">
              {triage.suggestedEffort}
            </span>
          </div>
        )}
        {triage.riskLevel && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Risk:</span>
            <span
              className={`px-1.5 py-0.5 rounded-full font-medium capitalize ${
                riskColors[triage.riskLevel] ?? ""
              }`}
            >
              {triage.riskLevel}
            </span>
          </div>
        )}
        {triage.suggestedSprint && (
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground">Sprint:</span>
            <span className="font-medium">{triage.suggestedSprint}</span>
          </div>
        )}
      </div>

      {triage.rationale && (
        <p className="text-xs text-muted-foreground border-t pt-2">
          {triage.rationale}
        </p>
      )}
    </div>
  );
}

export const TriageResult = memo(PureTriageResult, () => true);
