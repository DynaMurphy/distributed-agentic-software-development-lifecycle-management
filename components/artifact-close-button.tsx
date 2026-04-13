import { memo } from "react";
import { initialArtifactData, useArtifact } from "@/hooks/use-artifact";
import { CrossIcon } from "./icons";
import { Button } from "./ui/button";

const BROWSER_PARENT_KINDS: Record<
  string,
  { kind: string; documentId: string; title: string }
> = {
  spec: {
    kind: "document",
    documentId: "documents-browser",
    title: "Documents",
  },
};

function PureArtifactCloseButton() {
  const { setArtifact } = useArtifact();

  return (
    <Button
      className="h-fit p-2 dark:hover:bg-zinc-700"
      data-testid="artifact-close-button"
      onClick={() => {
        setArtifact((currentArtifact) => {
          if (currentArtifact.status === "streaming") {
            return { ...currentArtifact, isVisible: false };
          }

          const parentBrowser = BROWSER_PARENT_KINDS[currentArtifact.kind];
          if (parentBrowser) {
            return {
              ...currentArtifact,
              documentId: parentBrowser.documentId,
              kind: parentBrowser.kind as any,
              title: parentBrowser.title,
              content: "",
              status: "idle",
            };
          }

          return { ...initialArtifactData, status: "idle" };
        });
      }}
      variant="outline"
    >
      <CrossIcon size={18} />
    </Button>
  );
}

export const ArtifactCloseButton = memo(PureArtifactCloseButton, () => true);
