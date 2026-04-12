"use client";

import { memo, useCallback } from "react";
import { toast } from "sonner";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "./artifact";

type SplmToolResultProps = {
  type: "create" | "open" | "update";
  result: { id: string; title: string; kind: string };
  isReadonly: boolean;
};

const kindIcons: Record<string, string> = {
  feature: "✨",
  bug: "🐛",
  backlog: "📋",
  spec: "📝",
};

const actionLabels: Record<string, string> = {
  create: "Created",
  open: "Opened",
  update: "Updated",
};

function PureSplmToolResult({ type, result, isReadonly }: SplmToolResultProps) {
  const { setArtifact } = useArtifact();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (isReadonly) {
        toast.error(
          "Viewing items in shared chats is currently not supported."
        );
        return;
      }

      const rect = event.currentTarget.getBoundingClientRect();

      setArtifact((currentArtifact) => ({
        ...currentArtifact,
        documentId: result.id,
        kind: result.kind as ArtifactKind,
        title: result.title,
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        },
      }));
    },
    [result, setArtifact, isReadonly]
  );

  const icon = kindIcons[result.kind] ?? "📄";
  const label = actionLabels[type] ?? "Opened";

  return (
    <button
      className="flex w-fit cursor-pointer flex-row items-start gap-3 rounded-xl border bg-background px-3 py-2"
      onClick={handleClick}
      type="button"
    >
      <div className="mt-0.5 text-base leading-none">{icon}</div>
      <div className="text-left">{`${label} "${result.title}"`}</div>
    </button>
  );
}

export const SplmToolResult = memo(PureSplmToolResult, () => true);
