"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { useWindowSize } from "usehooks-ts";
import { useArtifact } from "@/hooks/use-artifact";
import type { Document } from "@/lib/db/schema";
import { LoaderIcon } from "./icons";
import { Button } from "./ui/button";

type VersionFooterProps = {
  handleVersionChange: (type: "next" | "prev" | "toggle" | "latest") => void;
  documents: Document[] | undefined;
  currentVersionIndex: number;
};

export const VersionFooter = ({
  handleVersionChange,
  documents,
  currentVersionIndex,
}: VersionFooterProps) => {
  const { artifact } = useArtifact();

  const { width } = useWindowSize();
  const isMobile = width < 768;

  const { mutate } = useSWRConfig();
  const [isMutating, setIsMutating] = useState(false);

  if (!documents) {
    return;
  }

  const viewedDoc = documents[currentVersionIndex];
  const viewedDate = viewedDoc
    ? new Date(viewedDoc.createdAt).toLocaleString()
    : null;
  const viewedEmail = (viewedDoc as any)?.maintainedByEmail as
    | string
    | undefined;

  return (
    <motion.div
      animate={{ y: 0 }}
      className="absolute bottom-0 z-50 flex w-full flex-col justify-between gap-4 border-t bg-background p-4 lg:flex-row"
      exit={{ y: isMobile ? 200 : 77 }}
      initial={{ y: isMobile ? 200 : 77 }}
      transition={{ type: "spring", stiffness: 140, damping: 20 }}
    >
      <div>
        <div>You are viewing a previous version</div>
        <div className="text-muted-foreground text-sm">
          {viewedDate && (
            <span>
              Last modified: {viewedDate}
              {viewedEmail && <span> by {viewedEmail}</span>}
              {" · "}
            </span>
          )}
          Restore this version to make edits
        </div>
      </div>

      <div className="flex flex-row gap-4">
        <Button
          disabled={isMutating}
          onClick={async () => {
            setIsMutating(true);

            const isSpecArtifact = artifact.kind === "spec";
            const apiBase = isSpecArtifact
              ? `/api/spec-document`
              : `/api/document`;

            // Non-destructive restore for ALL artifact types:
            // Create a new version with the restored content, preserving full history.
            const restoredDoc = documents?.[currentVersionIndex];
            if (restoredDoc) {
              if (isSpecArtifact) {
                await fetch(`${apiBase}?id=${artifact.documentId}`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    title: restoredDoc.title,
                    content: restoredDoc.content,
                  }),
                });
              } else {
                await fetch(`${apiBase}?id=${artifact.documentId}`, {
                  method: "POST",
                  body: JSON.stringify({
                    title: restoredDoc.title,
                    content: restoredDoc.content,
                    kind: artifact.kind,
                  }),
                });
              }
              // Revalidate the document list to pick up the new version
              mutate(`${apiBase}?id=${artifact.documentId}`);
            }

            setIsMutating(false);
            handleVersionChange("latest");
          }}
        >
          <div>Restore this version</div>
          {isMutating && (
            <div className="animate-spin">
              <LoaderIcon />
            </div>
          )}
        </Button>
        <Button
          onClick={() => {
            handleVersionChange("latest");
          }}
          variant="outline"
        >
          Back to latest version
        </Button>
      </div>
    </motion.div>
  );
};
