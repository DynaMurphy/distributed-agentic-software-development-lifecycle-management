"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import {
  ChevronRightIcon,
  FileTextIcon,
  FolderIcon,
  XIcon,
} from "lucide-react";
import { Artifact } from "@/components/create-artifact";
import { DocumentSkeleton } from "@/components/document-skeleton";
import { Badge } from "@/components/ui/badge";
import { useSelectedRepository } from "@/hooks/use-selected-repository";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useArtifact } from "@/hooks/use-artifact";
import { fetcher } from "@/lib/utils";

interface DocumentSummary {
  id: string;
  version_id: string;
  title: string;
  valid_from: string;
  parent_id: string | null;
  sort_order: number;
}

type DocumentArtifactMetadata = {
  /** ID of document being viewed (null = browser mode) */
  selectedDocument: string | null;
};

// ---------------------------------------------------------------------------
// Hierarchical document tree
// ---------------------------------------------------------------------------

interface DocumentNode {
  doc: DocumentSummary;
  children: DocumentNode[];
}

function buildDocumentTree(docs: DocumentSummary[]): DocumentNode[] {
  const byId = new Map<string, DocumentSummary>();
  for (const d of docs) byId.set(d.id, d);

  const childrenOf = new Map<string | null, DocumentSummary[]>();
  for (const d of docs) {
    const parentKey = d.parent_id ?? null;
    if (!childrenOf.has(parentKey)) childrenOf.set(parentKey, []);
    childrenOf.get(parentKey)!.push(d);
  }

  // Sort children by sort_order
  for (const arr of childrenOf.values()) {
    arr.sort((a, b) => a.sort_order - b.sort_order);
  }

  function build(parentId: string | null): DocumentNode[] {
    const children = childrenOf.get(parentId) ?? [];
    return children.map((doc) => ({
      doc,
      children: build(doc.id),
    }));
  }

  return build(null);
}

// ---------------------------------------------------------------------------
// Document card component
// ---------------------------------------------------------------------------

function DocumentCard({
  node,
  depth,
  onSelect,
}: {
  node: DocumentNode;
  depth: number;
  onSelect: (doc: DocumentSummary) => void;
}) {
  const hasChildren = node.children.length > 0;

  return (
    <div>
      <Card
        className="cursor-pointer transition-colors hover:bg-accent"
        style={{ marginLeft: depth * 16 }}
        onClick={() => onSelect(node.doc)}
      >
        <CardHeader className="p-4">
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <FolderIcon className="size-4 text-muted-foreground shrink-0" />
            ) : (
              <FileTextIcon className="size-4 text-muted-foreground shrink-0" />
            )}
            <CardTitle className="text-sm font-medium flex-1">
              {node.doc.title}
            </CardTitle>
            {hasChildren && (
              <Badge variant="secondary" className="text-xs">
                {node.children.length}
              </Badge>
            )}
            <ChevronRightIcon className="size-4 text-muted-foreground" />
          </div>
          <CardDescription className="text-xs ml-6">
            {new Date(node.doc.valid_from).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
      </Card>
      {node.children.map((child) => (
        <DocumentCard
          key={child.doc.id}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Browser view — shows all documents in hierarchy
// ---------------------------------------------------------------------------

function DocumentBrowserView({
  onSelect,
}: {
  onSelect: (doc: DocumentSummary) => void;
}) {
  const { selectedRepositoryId } = useSelectedRepository();
  const repoParam = selectedRepositoryId
    ? `?productId=${selectedRepositoryId}`
    : "";
  const { data: documents, isLoading } = useSWR<DocumentSummary[]>(
    `/api/spec-document${repoParam}`,
    fetcher,
  );

  const tree = useMemo(
    () => (documents ? buildDocumentTree(documents) : []),
    [documents],
  );

  if (isLoading) {
    return <DocumentSkeleton artifactKind="text" />;
  }

  if (!documents || documents.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <div className="text-center">
          <FileTextIcon className="mx-auto mb-3 size-12 opacity-30" />
          <p>No documents found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <FileTextIcon className="size-5" />
          <div>
            <h2 className="text-lg font-semibold">Documents</h2>
            <p className="text-xs text-muted-foreground">
              Browse and manage spec documents
            </p>
          </div>
        </div>
        <Badge variant="secondary">{documents.length} documents</Badge>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-2">
          {tree.map((node) => (
            <DocumentCard
              key={node.doc.id}
              node={node}
              depth={0}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Artifact content wrapper
// ---------------------------------------------------------------------------

function DocumentArtifactContent({
  metadata,
  setMetadata,
}: {
  metadata: DocumentArtifactMetadata;
  setMetadata: React.Dispatch<React.SetStateAction<DocumentArtifactMetadata>>;
}) {
  const { setArtifact } = useArtifact();

  const handleSelect = useCallback(
    (doc: DocumentSummary) => {
      // Open the document in the spec editor
      setArtifact((current) => ({
        ...current,
        documentId: doc.id,
        kind: "spec" as const,
        title: doc.title,
        content: "",
        isVisible: true,
        status: "idle",
        boundingBox: { top: 0, left: 0, width: 0, height: 0 },
      }));
    },
    [setArtifact],
  );

  return <DocumentBrowserView onSelect={handleSelect} />;
}

// ---------------------------------------------------------------------------
// Artifact definition
// ---------------------------------------------------------------------------

export const documentArtifact = new Artifact<
  "document",
  DocumentArtifactMetadata
>({
  kind: "document",
  description: "Document browser with hierarchical view",

  initialize: ({ setMetadata }) => {
    setMetadata({
      selectedDocument: null,
    });
  },

  onStreamPart: () => {},

  content: ({ isLoading, metadata, setMetadata }) => {
    if (isLoading) {
      return <DocumentSkeleton artifactKind="text" />;
    }

    return (
      <DocumentArtifactContent
        metadata={metadata}
        setMetadata={setMetadata}
      />
    );
  },

  actions: [],

  toolbar: [],
});
