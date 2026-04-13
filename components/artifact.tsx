import type { UseChatHelpers } from "@ai-sdk/react";
import { formatDistance } from "date-fns";
import equal from "fast-deep-equal";
import { AnimatePresence, motion } from "framer-motion";
import {
  type Dispatch,
  memo,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDebounceCallback } from "usehooks-ts";
import { useIsMobile } from "@/hooks/use-mobile";
import { backlogArtifact } from "@/artifacts/backlog/client";
import { bugArtifact } from "@/artifacts/bug/client";
import { codeArtifact } from "@/artifacts/code/client";
import { featureArtifact } from "@/artifacts/feature/client";
import { imageArtifact } from "@/artifacts/image/client";
import { sheetArtifact } from "@/artifacts/sheet/client";
import { skillArtifact } from "@/artifacts/skill/client";
import { specArtifact } from "@/artifacts/spec/client";
import { repositoryArtifact } from "@/artifacts/repository/client";
import { templateArtifact } from "@/artifacts/template/client";
import { textArtifact } from "@/artifacts/text/client";
import { useArtifact } from "@/hooks/use-artifact";
import type { Document, Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher } from "@/lib/utils";
import { ArtifactActions } from "./artifact-actions";
import { ArtifactCloseButton } from "./artifact-close-button";
import { InlineEditableTitle } from "./inline-editable-title";
import { RightChatPanel } from "./right-chat-panel";
import { Toolbar } from "./toolbar";
import { VersionFooter } from "./version-footer";
import { VersionHistoryPanel } from "./version-history-panel";
import type { VisibilityType } from "./visibility-selector";

/** Extract "Updated … ago" from SPLM artifact JSON content (bugs, features, backlog). */
function SplmMetadataLine({ content }: { content: string }) {
  try {
    const parsed = JSON.parse(content);
    const dateStr = parsed.valid_from ?? parsed.created_at;
    if (!dateStr) return null;
    return (
      <div className="text-muted-foreground text-sm">
        {`Updated ${formatDistance(new Date(dateStr), new Date(), { addSuffix: true })}`}
        {parsed.maintained_by_email && (
          <span> by {parsed.maintained_by_email}</span>
        )}
      </div>
    );
  } catch {
    return null;
  }
}

export const artifactDefinitions = [
  textArtifact,
  codeArtifact,
  imageArtifact,
  sheetArtifact,
  specArtifact,
  featureArtifact,
  bugArtifact,
  backlogArtifact,
  skillArtifact,
  templateArtifact,
  repositoryArtifact,
];
export type ArtifactKind = (typeof artifactDefinitions)[number]["kind"];

export type UIArtifact = {
  title: string;
  documentId: string;
  kind: ArtifactKind;
  content: string;
  isVisible: boolean;
  status: "streaming" | "idle";
  boundingBox: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
};

function PureArtifact({
  addToolApprovalResponse,
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  sendMessage,
  messages,
  setMessages,
  regenerate,
  votes,
  isReadonly,
  selectedVisibilityType,
  selectedModelId,
}: {
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  chatId: string;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  attachments: Attachment[];
  setAttachments: Dispatch<SetStateAction<Attachment[]>>;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  votes: Vote[] | undefined;
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  isReadonly: boolean;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
}) {
  const { artifact, setArtifact, metadata, setMetadata } = useArtifact();

  const splmKinds = ["feature", "bug", "backlog", "skill", "template", "repository"];
  const isSplmArtifact = splmKinds.includes(artifact.kind);

  // Guard against invalid / placeholder document IDs ("init", literal "undefined")
  const hasValidDocumentId =
    artifact.documentId &&
    artifact.documentId !== "init" &&
    artifact.documentId !== "undefined";

  const {
    data: documents,
    isLoading: isDocumentsFetching,
    mutate: mutateDocuments,
  } = useSWR<Document[]>(
    hasValidDocumentId && artifact.status !== "streaming" && !isSplmArtifact
      ? artifact.kind === "spec"
        ? `/api/spec-document?id=${artifact.documentId}`
        : `/api/document?id=${artifact.documentId}`
      : null,
    fetcher,
    {
      // Prevent infinite retry loops if the document hasn't been persisted yet
      shouldRetryOnError: false,
    }
  );

  const [mode, setMode] = useState<"edit" | "diff">("edit");
  const [currentVersionIndex, setCurrentVersionIndex] = useState(-1);
  const prevDocumentIdRef = useRef<string | null>(null);

  // Derive `document` from the SWR cache so it's available immediately on
  // remount (no extra render cycle where document === null).
  const document = useMemo(() => {
    if (!documents || documents.length === 0) return null;
    if (currentVersionIndex >= 0 && currentVersionIndex < documents.length) {
      return documents[currentVersionIndex];
    }
    return documents.at(-1) ?? null;
  }, [documents, currentVersionIndex]);

  const [rightPanelWidth, setRightPanelWidth] = useState(360);

  useEffect(() => {
    if (documents && documents.length > 0) {
      const mostRecentDocument = documents.at(-1);

      if (mostRecentDocument) {
        // Only reset version index when switching to a different artifact
        // (not on SWR revalidation of the same document).
        const docId = mostRecentDocument.id;
        if (prevDocumentIdRef.current !== docId) {
          setCurrentVersionIndex(documents.length - 1);
          prevDocumentIdRef.current = docId;
        }

        setArtifact((currentArtifact) => {
          // For spec artifacts, don't overwrite content that was loaded from
          // streaming or user edits — UNLESS the document ID changed (i.e.
          // we switched to a different spec).
          if (
            currentArtifact.kind === "spec" &&
            currentArtifact.content &&
            currentArtifact.documentId === mostRecentDocument.id
          ) {
            return currentArtifact;
          }
          return {
            ...currentArtifact,
            content: mostRecentDocument.content ?? "",
          };
        });
      }
    }
  }, [documents, setArtifact]);

  useEffect(() => {
    mutateDocuments();
  }, [mutateDocuments]);

  const { mutate } = useSWRConfig();
  const [isContentDirty, setIsContentDirty] = useState(false);

  // Reset dirty flag when the document changes.
  useEffect(() => {
    setIsContentDirty(false);
    prevDocumentIdRef.current = null;
  }, [artifact.documentId]);

  const handleContentChange = useCallback(
    (updatedContent: string) => {
      if (!artifact) {
        return;
      }

      // For spec and SPLM artifacts, don't auto-save to DB. Just update local state.
      if (artifact.kind === "spec" || splmKinds.includes(artifact.kind)) {
        setArtifact((current) => ({
          ...current,
          content: updatedContent,
        }));
        return;
      }

      mutate<Document[]>(
        `/api/document?id=${artifact.documentId}`,
        async (currentDocuments) => {
          if (!currentDocuments) {
            return [];
          }

          const currentDocument = currentDocuments.at(-1);

          if (!currentDocument || !currentDocument.content) {
            setIsContentDirty(false);
            return currentDocuments;
          }

          if (currentDocument.content !== updatedContent) {
            await fetch(`/api/document?id=${artifact.documentId}`, {
              method: "POST",
              body: JSON.stringify({
                title: artifact.title,
                content: updatedContent,
                kind: artifact.kind,
              }),
            });

            setIsContentDirty(false);

            const newDocument = {
              ...currentDocument,
              content: updatedContent,
              createdAt: new Date(),
            };

            return [...currentDocuments, newDocument];
          }
          return currentDocuments;
        },
        { revalidate: false }
      );
    },
    [artifact, mutate]
  );

  const debouncedHandleContentChange = useDebounceCallback(
    handleContentChange,
    2000
  );

  const saveContent = useCallback(
    (updatedContent: string, debounce: boolean) => {
      // For SPLM artifacts, `document` is always null because we skip the
      // SWR document fetch.  Bypass the guard so edits still propagate to
      // `handleContentChange` (which updates the in-memory artifact content).
      if (isSplmArtifact) {
        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
        return;
      }

      if (document && updatedContent !== document.content) {
        setIsContentDirty(true);

        if (debounce) {
          debouncedHandleContentChange(updatedContent);
        } else {
          handleContentChange(updatedContent);
        }
      }
    },
    [document, isSplmArtifact, debouncedHandleContentChange, handleContentChange]
  );

  function getDocumentContentById(index: number) {
    if (!documents) {
      return "";
    }
    if (!documents[index]) {
      return "";
    }
    return documents[index].content ?? "";
  }

  const handleVersionChange = (type: "next" | "prev" | "toggle" | "latest") => {
    if (!documents) {
      return;
    }

    if (type === "latest") {
      setCurrentVersionIndex(documents.length - 1);
      setMode("edit");
    }

    if (type === "toggle") {
      setMode((currentMode) => (currentMode === "edit" ? "diff" : "edit"));
    }

    if (type === "prev") {
      if (currentVersionIndex > 0) {
        setCurrentVersionIndex((index) => index - 1);
      }
    } else if (type === "next" && currentVersionIndex < documents.length - 1) {
      setCurrentVersionIndex((index) => index + 1);
    }
  };

  /** Jump directly to a specific version by index (used by VersionHistoryPanel). */
  const handleSelectVersion = (index: number) => {
    if (!documents || index < 0 || index >= documents.length) {
      return;
    }
    setCurrentVersionIndex(index);
  };

  /**
   * Handle document title changes from the inline-editable title component.
   * Updates the in-memory artifact state and invalidates the SWR document cache
   * so all UI elements reflect the new title immediately.
   */
  const handleTitleChange = useCallback(
    (newTitle: string) => {
      // Update the in-memory artifact state
      setArtifact((current) => ({ ...current, title: newTitle }));

      // Update the SWR document cache so version labels etc. also reflect the new title
      if (artifact.kind === "spec") {
        mutate<Document[]>(
          `/api/spec-document?id=${artifact.documentId}`,
          (currentDocuments) =>
            currentDocuments?.map((doc) => ({ ...doc, title: newTitle })),
          { revalidate: false }
        );
        // Revalidate sidebar listing
        mutate("/api/spec-document");
      } else if (artifact.kind === "feature") {
        // Revalidate sidebar features list
        mutate("/api/features");
      } else if (artifact.kind === "bug") {
        // Revalidate sidebar bugs list
        mutate("/api/bugs");
      } else {
        mutate<Document[]>(
          `/api/document?id=${artifact.documentId}`,
          (currentDocuments) =>
            currentDocuments?.map((doc) => ({ ...doc, title: newTitle })),
          { revalidate: false }
        );
      }
    },
    [setArtifact, artifact.kind, artifact.documentId, mutate]
  );

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const [isToolbarVisible, setIsToolbarVisible] = useState(false);

  /*
   * NOTE: if there are no documents, or if
   * the documents are being fetched, then
   * we mark it as the current version.
   */

  const isCurrentVersion =
    documents && documents.length > 0
      ? currentVersionIndex === documents.length - 1
      : true;

  const isMobile = useIsMobile();

  const artifactDefinition = artifactDefinitions.find(
    (definition) => definition.kind === artifact.kind
  );

  if (!artifactDefinition) {
    throw new Error("Artifact definition not found!");
  }

  useEffect(() => {
    if (artifact.documentId !== "init" && artifactDefinition.initialize) {
      artifactDefinition.initialize({
        documentId: artifact.documentId,
        setMetadata,
        setArtifact,
      });
    }
  }, [artifact.documentId, artifactDefinition, setMetadata, setArtifact]);

  return (
    <AnimatePresence>
      {artifact.isVisible && (
        <motion.div
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-10 flex flex-row overflow-hidden"
          data-testid="artifact"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
        >
          {/* Center content panel */}
          <div className="relative flex flex-1 flex-col overflow-hidden bg-background dark:bg-muted">
            <div className="flex flex-row items-start justify-between p-2">
              <div className="flex flex-row items-start gap-4">
                <ArtifactCloseButton />

                <div className="flex flex-col">
                  <InlineEditableTitle
                    documentId={artifact.documentId}
                    isEditable={
                      !isReadonly &&
                      artifact.kind !== "backlog" &&
                      isCurrentVersion &&
                      artifact.status !== "streaming"
                    }
                    kind={artifact.kind}
                    onTitleChange={handleTitleChange}
                    title={artifact.title}
                  />

                  {isContentDirty ? (
                    <div className="text-muted-foreground text-sm">
                      Saving changes...
                    </div>
                  ) : document ? (
                    <div className="flex items-center gap-2">
                      <div className="text-muted-foreground text-sm">
                        {`Updated ${formatDistance(
                          new Date(document.createdAt),
                          new Date(),
                          {
                            addSuffix: true,
                          }
                        )}`}
                        {(document as any).maintainedByEmail && (
                          <span> by {(document as any).maintainedByEmail}</span>
                        )}
                      </div>
                      {documents && documents.length > 1 && (
                        <button
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-md hover:bg-muted"
                          onClick={() => setIsHistoryOpen((v) => !v)}
                          type="button"
                        >
                          {isHistoryOpen ? "Hide" : `${documents.length} versions`}
                        </button>
                      )}
                    </div>
                  ) : isSplmArtifact && artifact.content ? (
                    <SplmMetadataLine content={artifact.content} />
                  ) : (
                    <div className="mt-2 h-3 w-32 animate-pulse rounded-md bg-muted-foreground/20" />
                  )}
                </div>
              </div>

              <ArtifactActions
                artifact={artifact}
                currentVersionIndex={currentVersionIndex}
                handleVersionChange={handleVersionChange}
                isCurrentVersion={isCurrentVersion}
                metadata={metadata}
                mode={mode}
                setMetadata={setMetadata}
              />
            </div>

            <AnimatePresence>
              {isHistoryOpen && (
                <VersionHistoryPanel
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  onSelectVersion={handleSelectVersion}
                />
              )}
            </AnimatePresence>

            <div className="h-full max-w-full! items-center overflow-y-scroll bg-background dark:bg-muted">
              <artifactDefinition.content
                key={`${artifact.kind}-${artifact.documentId}`}
                content={
                  isCurrentVersion
                    ? artifact.content
                    : getDocumentContentById(currentVersionIndex)
                }
                currentVersionIndex={currentVersionIndex}
                getDocumentContentById={getDocumentContentById}
                isCurrentVersion={isCurrentVersion}
                isInline={false}
                isLoading={isDocumentsFetching && !artifact.content}
                metadata={metadata}
                mode={mode}
                onSaveContent={saveContent}
                setMetadata={setMetadata}
                status={artifact.status}
                suggestions={[]}
                title={artifact.title}
              />

              <AnimatePresence>
                {isCurrentVersion && (
                  <Toolbar
                    artifactContent={artifact.content}
                    artifactId={artifact.documentId}
                    artifactKind={artifact.kind}
                    artifactTitle={artifact.title}
                    isToolbarVisible={isToolbarVisible}
                    sendMessage={sendMessage}
                    setIsToolbarVisible={setIsToolbarVisible}
                    setMessages={setMessages}
                    status={status}
                    stop={stop}
                  />
                )}
              </AnimatePresence>
            </div>

            <AnimatePresence>
              {!isCurrentVersion && (
                <VersionFooter
                  currentVersionIndex={currentVersionIndex}
                  documents={documents}
                  handleVersionChange={handleVersionChange}
                />
              )}
            </AnimatePresence>
          </div>

          {/* Right chat panel — desktop only */}
          {!isMobile && (
            <RightChatPanel
              addToolApprovalResponse={addToolApprovalResponse}
              artifactStatus={artifact.status}
              attachments={attachments}
              chatId={chatId}
              input={input}
              isCurrentVersion={isCurrentVersion}
              isReadonly={isReadonly}
              messages={messages}
              onPanelWidthChange={setRightPanelWidth}
              panelWidth={rightPanelWidth}
              regenerate={regenerate}
              selectedModelId={selectedModelId}
              selectedVisibilityType={selectedVisibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
              votes={votes}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export const Artifact = memo(PureArtifact, (prevProps, nextProps) => {
  if (prevProps.status !== nextProps.status) {
    return false;
  }
  if (!equal(prevProps.votes, nextProps.votes)) {
    return false;
  }
  if (prevProps.input !== nextProps.input) {
    return false;
  }
  if (prevProps.messages.length !== nextProps.messages.length) {
    return false;
  }
  if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType) {
    return false;
  }

  return true;
});
