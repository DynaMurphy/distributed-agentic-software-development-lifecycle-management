"use client";

import { useCallback, useEffect, useState } from "react";
import { useArtifact } from "@/hooks/use-artifact";
import type { ArtifactKind } from "@/components/artifact";
import { fetcher } from "@/lib/utils";

interface LinkedDocument {
  id: string;
  document_id: string;
  document_title?: string;
  link_type: string;
}

interface LinkedItem {
  id: string;
  item_type: string;
  item_id: string;
  link_type: string;
}

/**
 * Shows a compact list of documents linked to a work item (feature/bug).
 */
export function LinkedDocumentsBadge({
  itemType,
  itemId,
}: {
  itemType: "feature" | "bug";
  itemId: string;
}) {
  const { setArtifact } = useArtifact();
  const [links, setLinks] = useState<LinkedDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const openDocument = useCallback(
    (docId: string, docTitle: string) => {
      // All linked documents are bitemporal spec documents, so always open as "spec"
      setArtifact((current) => ({
        ...current,
        documentId: docId,
        kind: "spec" as ArtifactKind,
        title: docTitle,
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [setArtifact]
  );

  useEffect(() => {
    if (!itemId || itemId === "init") return;
    setIsLoading(true);
    fetch(`/api/item-links?itemType=${itemType}&itemId=${itemId}&titles=true`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: LinkedDocument[]) => {
        // Deduplicate by document_id, keeping only the latest version
        const seen = new Map<string, LinkedDocument>();
        for (const link of data) {
          if (!seen.has(link.document_id)) {
            seen.set(link.document_id, link);
          }
        }
        setLinks(Array.from(seen.values()));
      })
      .catch(() => setLinks([]))
      .finally(() => setIsLoading(false));
  }, [itemType, itemId]);

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-1">
        Loading linked docs...
      </div>
    );
  }

  if (links.length === 0) return null;

  return (
    <div className="px-3 py-2 border-t">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        Linked Documents ({links.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <button
            key={link.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs cursor-pointer hover:bg-muted/70 hover:underline transition-colors"
            title={`${link.link_type}: ${link.document_title ?? link.document_id}`}
            onClick={() =>
              openDocument(
                link.document_id,
                link.document_title ?? link.document_id.slice(0, 8)
              )
            }
            type="button"
          >
            <span className="text-muted-foreground">
              {link.link_type === "spec" ? "📄" : link.link_type === "derived" ? "📎" : "🔗"}
            </span>
            <span className="truncate max-w-[120px]">
              {link.document_title ?? link.document_id.slice(0, 8)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Shows a compact list of work items linked to a document.
 */
export function LinkedItemsBadge({
  documentId,
}: {
  documentId: string;
}) {
  const { setArtifact } = useArtifact();
  const [links, setLinks] = useState<LinkedItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const openItem = useCallback(
    (itemId: string, itemType: string) => {
      setArtifact((current) => ({
        ...current,
        documentId: itemId,
        kind: itemType as ArtifactKind,
        title: "",
        content: "",
        isVisible: true,
        status: "idle",
      }));
    },
    [setArtifact]
  );

  useEffect(() => {
    if (!documentId || documentId === "init") return;
    setIsLoading(true);
    fetch(`/api/item-links?documentId=${documentId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLinks(data))
      .catch(() => setLinks([]))
      .finally(() => setIsLoading(false));
  }, [documentId]);

  if (isLoading) {
    return (
      <div className="text-xs text-muted-foreground px-3 py-1">
        Loading linked items...
      </div>
    );
  }

  if (links.length === 0) return null;

  const itemEmoji: Record<string, string> = {
    feature: "✨",
    bug: "🐛",
  };

  return (
    <div className="px-3 py-2 border-b">
      <div className="text-xs font-medium text-muted-foreground mb-1.5">
        Linked Work Items ({links.length})
      </div>
      <div className="flex flex-wrap gap-1.5">
        {links.map((link) => (
          <button
            key={link.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs cursor-pointer hover:bg-muted/70 hover:underline transition-colors"
            title={`${link.item_type} ${link.item_id} (${link.link_type})`}
            onClick={() => openItem(link.item_id, link.item_type)}
            type="button"
          >
            <span>{itemEmoji[link.item_type] ?? "📌"}</span>
            <span className="truncate max-w-[100px]">
              {link.item_type} {link.item_id.slice(0, 8)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
