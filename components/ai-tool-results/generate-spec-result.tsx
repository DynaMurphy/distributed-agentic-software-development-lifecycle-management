"use client";

import { memo, useCallback } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";

interface GenerateSpecResultProps {
  output: {
    specId: string;
    featureId: string;
    title: string;
    linkId?: string;
    kind: string;
    content?: string;
  };
  isReadonly: boolean;
}

function PureGenerateSpecResult({
  output,
  isReadonly,
}: GenerateSpecResultProps) {
  const { setArtifact } = useArtifact();

  const openSpec = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      documentId: output.specId,
      kind: "spec" as ArtifactKind,
      title: output.title,
      content: "",
      isVisible: true,
      status: "idle",
    }));
  }, [output.specId, output.title, setArtifact]);

  const openFeature = useCallback(() => {
    setArtifact((current) => ({
      ...current,
      documentId: output.featureId,
      kind: "feature" as ArtifactKind,
      title: "",
      content: "",
      isVisible: true,
      status: "idle",
    }));
  }, [output.featureId, setArtifact]);

  return (
    <div className="w-full max-w-md rounded-xl border bg-background p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span>📝</span>
        <span>Specification Generated</span>
      </div>

      <div className="rounded-lg border p-3 space-y-2">
        <button
          className="text-sm font-medium hover:underline text-left w-full"
          onClick={openSpec}
          type="button"
        >
          {output.title}
        </button>
        <p className="text-xs text-muted-foreground">
          A new specification document has been generated and linked to the
          feature. Click to open and review.
        </p>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          className="px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          onClick={openSpec}
          type="button"
        >
          Open Specification
        </button>
        <button
          className="px-2.5 py-1.5 rounded-md border hover:bg-muted transition-colors"
          onClick={openFeature}
          type="button"
        >
          View Feature
        </button>
      </div>
    </div>
  );
}

export const GenerateSpecResult = memo(PureGenerateSpecResult, () => true);
