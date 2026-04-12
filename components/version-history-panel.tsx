"use client";

import { formatDistance } from "date-fns";
import { motion } from "framer-motion";
import type { Document } from "@/lib/db/schema";

type VersionHistoryPanelProps = {
  documents: Document[] | undefined;
  currentVersionIndex: number;
  onSelectVersion: (index: number) => void;
};

/**
 * Collapsible version history timeline that displays all versions of a document.
 * Reusable across text, code, spec, image, and sheet artifact types.
 *
 * Follows the same pattern as VersionTimeline in feature/bug artifacts, but
 * adapted for the generic Document type used by standard artifacts.
 */
export function VersionHistoryPanel({
  documents,
  currentVersionIndex,
  onSelectVersion,
}: VersionHistoryPanelProps) {
  if (!documents || documents.length <= 1) {
    return null;
  }

  return (
    <motion.div
      animate={{ opacity: 1, height: "auto" }}
      className="flex flex-col gap-1 px-4 py-3 border-b bg-muted/30"
      exit={{ opacity: 0, height: 0 }}
      initial={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Version History ({documents.length})
        </span>
        <span className="text-xs text-muted-foreground">
          Viewing {currentVersionIndex + 1} of {documents.length}
        </span>
      </div>
      <div className="flex flex-row gap-1 overflow-x-auto pb-1">
        {documents.map((doc, i) => {
          const isCurrent = i === documents.length - 1;
          const isSelected = i === currentVersionIndex;
          return (
            <button
              key={`${doc.id}-${doc.createdAt}`}
              className={`shrink-0 flex flex-col items-start px-3 py-2 rounded-md border text-left text-xs transition-colors ${
                isSelected
                  ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                  : "border-transparent bg-muted/50 hover:bg-muted"
              }`}
              onClick={() => onSelectVersion(i)}
              type="button"
            >
              <span className="font-medium truncate max-w-[140px]">
                {isCurrent ? "Current" : `v${i + 1}`}
              </span>
              <span className="text-muted-foreground">
                {formatDistance(new Date(doc.createdAt), new Date(), {
                  addSuffix: true,
                })}
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
