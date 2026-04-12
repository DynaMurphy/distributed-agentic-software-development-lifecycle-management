"use client";

import { memo, useCallback } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";

interface ImpactData {
  impactedSpecs?: Array<{
    specId: string;
    specTitle: string;
    impactLevel: string;
    description: string;
  }>;
  impactedBacklogItems?: Array<{
    itemId: string;
    itemTitle: string;
    relationship: string;
    description: string;
  }>;
  overallRisk?: string;
  summary?: string;
  recommendations?: string[];
  rawAnalysis?: string;
}

interface ImpactResultProps {
  output: {
    itemType: string;
    itemId: string;
    title: string;
    impact: ImpactData;
    content?: string;
  };
  isReadonly: boolean;
}

const riskBadge: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
  medium:
    "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400",
  low: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400",
};

const impactLevelBadge: Record<string, string> = {
  high: "text-red-600 dark:text-red-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  low: "text-green-600 dark:text-green-400",
};

function PureImpactResult({ output, isReadonly }: ImpactResultProps) {
  const { setArtifact } = useArtifact();
  const { title, impact } = output;

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

  return (
    <div className="w-full max-w-lg rounded-xl border bg-background p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>💥</span>
          <span>Impact Analysis: {title}</span>
        </div>
        {impact.overallRisk && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
              riskBadge[impact.overallRisk] ?? ""
            }`}
          >
            {impact.overallRisk} risk
          </span>
        )}
      </div>

      {/* Summary */}
      {impact.summary && (
        <p className="text-xs text-muted-foreground">{impact.summary}</p>
      )}

      {/* Impacted Specs */}
      {impact.impactedSpecs && impact.impactedSpecs.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Impacted Specifications:
          </div>
          {impact.impactedSpecs.map((spec) => (
            <button
              className="flex w-full items-center justify-between rounded-lg border p-2 text-left text-xs hover:bg-muted/50 transition-colors"
              key={spec.specId}
              onClick={() => openSpec(spec.specId, spec.specTitle)}
              type="button"
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{spec.specTitle}</div>
                <div className="text-muted-foreground truncate mt-0.5">
                  {spec.description}
                </div>
              </div>
              <span
                className={`ml-2 shrink-0 text-[10px] font-semibold uppercase ${
                  impactLevelBadge[spec.impactLevel] ?? ""
                }`}
              >
                {spec.impactLevel}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Impacted Backlog Items */}
      {impact.impactedBacklogItems &&
        impact.impactedBacklogItems.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground">
              Related Backlog Items:
            </div>
            {impact.impactedBacklogItems.map((item) => (
              <div
                className="flex items-center justify-between rounded-lg border p-2 text-xs"
                key={item.itemId}
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{item.itemTitle}</div>
                  <div className="text-muted-foreground truncate mt-0.5">
                    {item.description}
                  </div>
                </div>
                <span className="ml-2 shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-muted font-medium">
                  {item.relationship}
                </span>
              </div>
            ))}
          </div>
        )}

      {/* Recommendations */}
      {impact.recommendations && impact.recommendations.length > 0 && (
        <div className="space-y-1 border-t pt-2">
          <div className="text-xs font-medium text-muted-foreground">
            Recommendations:
          </div>
          <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
            {impact.recommendations.map((rec, i) => (
              <li key={i}>{rec}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export const ImpactResult = memo(PureImpactResult, () => true);
