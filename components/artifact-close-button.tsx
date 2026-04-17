import { memo } from "react";
import { useArtifact, useArtifactStack } from "@/hooks/use-artifact";
import { CrossIcon } from "./icons";
import { Button } from "./ui/button";

function PureArtifactCloseButton() {
  const { artifact } = useArtifact();
  const { canGoBack, pop, clear } = useArtifactStack();

  return (
    <Button
      className="h-fit p-2 dark:hover:bg-zinc-700"
      data-testid="artifact-close-button"
      onClick={() => {
        if (artifact.status === "streaming") {
          // While streaming, just hide without disrupting the stream
          clear();
          return;
        }

        if (canGoBack) {
          pop();
        } else {
          clear();
        }
      }}
      variant="outline"
    >
      <CrossIcon size={18} />
    </Button>
  );
}

export const ArtifactCloseButton = memo(PureArtifactCloseButton, () => true);
