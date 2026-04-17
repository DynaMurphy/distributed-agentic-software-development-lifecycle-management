"use client";

import { ArrowLeft, X } from "lucide-react";
import { useArtifactStack } from "@/hooks/use-artifact";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./ui/tooltip";

export function BreadcrumbBar() {
  const { stack, canGoBack, pop, popTo, clear } = useArtifactStack();

  if (stack.length === 0) return null;

  // Determine which segments to show (overflow: keep first + last 2, collapse middle)
  const MAX_VISIBLE = 4;
  let visibleSegments: { entry: (typeof stack)[number]; originalIndex: number }[];
  let hasOverflow = false;

  if (stack.length <= MAX_VISIBLE) {
    visibleSegments = stack.map((entry, i) => ({ entry, originalIndex: i }));
  } else {
    hasOverflow = true;
    visibleSegments = [
      { entry: stack[0], originalIndex: 0 },
      // ellipsis placeholder handled in render
      { entry: stack[stack.length - 2], originalIndex: stack.length - 2 },
      { entry: stack[stack.length - 1], originalIndex: stack.length - 1 },
    ];
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border bg-background/50 text-sm min-h-[36px]">
      {/* Back button */}
      {canGoBack && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              className="h-7 w-7 p-0 shrink-0"
              onClick={pop}
              size="icon"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Go back</TooltipContent>
        </Tooltip>
      )}

      {/* Breadcrumb segments */}
      <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
        {visibleSegments.map(({ entry, originalIndex }, displayIndex) => {
          const isLast = originalIndex === stack.length - 1;

          return (
            <span key={`${originalIndex}-${entry.documentId}`} className="flex items-center gap-0.5 min-w-0">
              {/* Show overflow indicator after first segment */}
              {hasOverflow && displayIndex === 1 && (
                <>
                  <span className="text-muted-foreground mx-0.5">/</span>
                  <span className="text-muted-foreground text-xs">…</span>
                </>
              )}

              {(displayIndex > 0 || (hasOverflow && displayIndex === 0)) && displayIndex > 0 && (
                <span className="text-muted-foreground mx-0.5">/</span>
              )}

              {isLast ? (
                <span className="truncate font-medium text-foreground max-w-[200px]">
                  {entry.title}
                </span>
              ) : (
                <button
                  className="truncate text-muted-foreground hover:text-foreground transition-colors max-w-[160px]"
                  onClick={() => popTo(originalIndex)}
                  type="button"
                >
                  {entry.title}
                </button>
              )}
            </span>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Close button */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            className="h-7 w-7 p-0 shrink-0"
            data-testid="artifact-close-button"
            onClick={clear}
            size="icon"
            variant="ghost"
          >
            <X className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Close</TooltipContent>
      </Tooltip>
    </div>
  );
}
