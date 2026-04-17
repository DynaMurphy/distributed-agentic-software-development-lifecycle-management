"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import {
  Check,
  Eye,
  History,
  MessageSquare,
  MoreHorizontal,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWRInfinite from "swr/infinite";
import type { Vote } from "@/lib/db/schema";
import type { Chat } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import { fetcher } from "@/lib/utils";
import { useContextMarkers } from "@/hooks/use-context-markers";
import { useArtifactStack } from "@/hooks/use-artifact";
import { ArtifactMessages } from "./artifact-messages";
import type { SwitchChatFn } from "./chat";
import { LoaderIcon } from "./icons";
import { MultimodalInput } from "./multimodal-input";
import type { UIArtifact } from "./artifact";
import type { VisibilityType } from "./visibility-selector";
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from "./ui/sidebar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const RIGHT_PANEL_ICON_WIDTH = 48;
const SESSION_KEY = "right-panel-collapsed";
const TAB_KEY = "right-panel-tab";
const PAGE_SIZE = 20;

type PanelTab = "active" | "history";

type ChatHistory = {
  chats: Chat[];
  hasMore: boolean;
};

function getChatHistoryPaginationKey(
  pageIndex: number,
  previousPageData: ChatHistory
) {
  if (previousPageData && previousPageData.hasMore === false) return null;
  if (pageIndex === 0) return `/api/history?limit=${PAGE_SIZE}`;
  const lastChat = previousPageData.chats.at(-1);
  if (!lastChat) return null;
  return `/api/history?ending_before=${lastChat.id}&limit=${PAGE_SIZE}`;
}

function groupChatsByDate(chats: Chat[]) {
  const now = new Date();
  const oneWeekAgo = subWeeks(now, 1);
  const oneMonthAgo = subMonths(now, 1);

  const groups: { label: string; chats: Chat[] }[] = [
    { label: "Today", chats: [] },
    { label: "Yesterday", chats: [] },
    { label: "Last 7 days", chats: [] },
    { label: "Last 30 days", chats: [] },
    { label: "Older", chats: [] },
  ];

  for (const chat of chats) {
    const d = new Date(chat.createdAt);
    if (isToday(d)) groups[0].chats.push(chat);
    else if (isYesterday(d)) groups[1].chats.push(chat);
    else if (d > oneWeekAgo) groups[2].chats.push(chat);
    else if (d > oneMonthAgo) groups[3].chats.push(chat);
    else groups[4].chats.push(chat);
  }

  return groups.filter((g) => g.chats.length > 0);
}

/** Inline history list for the right panel */
function PanelChatHistory({
  activeChatId,
  fullWidth,
  onNavigateToChat,
  onSwitchChat,
}: {
  activeChatId: string;
  fullWidth: boolean;
  onNavigateToChat?: () => void;
  onSwitchChat?: SwitchChatFn;
}) {
  const router = useRouter();
  const {
    data: pages,
    setSize,
    isValidating,
    isLoading,
    mutate,
  } = useSWRInfinite<ChatHistory>(getChatHistoryPaginationKey, fetcher, {
    fallbackData: [],
  });

  const hasReachedEnd = pages?.some((p) => p.hasMore === false) ?? false;
  const allChats = pages?.flatMap((p) => p.chats) ?? [];
  const grouped = groupChatsByDate(allChats);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleDelete = useCallback(
    (chatId: string) => {
      const isCurrentChat = chatId === activeChatId;
      setDeleteTarget(null);

      const deletePromise = fetch(`/api/chat?id=${chatId}`, { method: "DELETE" });
      toast.promise(deletePromise, {
        loading: "Deleting chat...",
        success: () => {
          mutate((histories) =>
            histories?.map((h) => ({
              ...h,
              chats: h.chats.filter((c) => c.id !== chatId),
            }))
          );
          if (isCurrentChat) {
            if (onSwitchChat) {
              onSwitchChat(null);
            } else {
              router.replace("/");
            }
          }
          return "Chat deleted";
        },
        error: "Failed to delete chat",
      });
    },
    [mutate, activeChatId, router]
  );

  const handleDeleteAll = useCallback(() => {
    setShowDeleteAll(false);
    const deletePromise = fetch("/api/history", { method: "DELETE" });
    toast.promise(deletePromise, {
      loading: "Deleting all chats...",
      success: () => {
        mutate(() => []);
        if (onSwitchChat) {
          onSwitchChat(null);
        } else {
          router.replace("/");
        }
        return "All chats deleted";
      },
      error: "Failed to delete chats",
    });
  }, [mutate, router]);

  const handleRename = useCallback(
    (chatId: string) => {
      const trimmed = renameValue.trim();
      if (!trimmed) {
        setRenamingId(null);
        return;
      }

      setRenamingId(null);
      const renamePromise = fetch(`/api/chat?id=${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      toast.promise(renamePromise, {
        loading: "Renaming...",
        success: () => {
          mutate((histories) =>
            histories?.map((h) => ({
              ...h,
              chats: h.chats.map((c) =>
                c.id === chatId ? { ...c, title: trimmed } : c
              ),
            }))
          );
          return "Chat renamed";
        },
        error: "Failed to rename chat",
      });
    },
    [renameValue, mutate]
  );

  const startRename = (chat: Chat) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {[44, 32, 28, 64, 52].map((w) => (
          <div key={w} className="h-8 flex items-center px-2">
            <div
              className="h-4 rounded-md bg-muted-foreground/10"
              style={{ width: `${w}%` }}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header actions */}
      <div className={`flex items-center justify-between py-2 border-b border-sidebar-border ${fullWidth ? "px-4 md:px-16 lg:px-64" : "px-3"}`}>
        <button
          type="button"
          onClick={() => {
            onNavigateToChat?.();
            if (onSwitchChat) {
              onSwitchChat(null);
            } else {
              router.push("/");
            }
          }}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
        {allChats.length > 0 && (
          <button
            type="button"
            onClick={() => setShowDeleteAll(true)}
            className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete all
          </button>
        )}
      </div>

      {allChats.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-sm text-muted-foreground">
          No conversations yet.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className={`flex flex-col gap-4 ${fullWidth ? "px-4 py-2 md:px-16 lg:px-64" : "p-2"}`}>
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
                  {group.label}
                </div>
                {group.chats.map((chat) => {
                  const isActive = chat.id === activeChatId;
                  const isRenaming = renamingId === chat.id;

                  return (
                    <div
                      key={chat.id}
                      className={`group flex items-center gap-1 rounded-md text-sm transition-colors ${
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "hover:bg-muted"
                      }`}
                    >
                      {isRenaming ? (
                        <div className="flex flex-1 items-center gap-1 px-1 py-0.5">
                          <input
                            ref={renameInputRef}
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRename(chat.id);
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            className="flex-1 rounded border border-border bg-background px-1.5 py-1 text-sm outline-none focus:border-primary"
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(chat.id)}
                            className="shrink-0 rounded p-1 text-primary hover:bg-primary/10"
                            aria-label="Confirm rename"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
                            aria-label="Cancel rename"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              onNavigateToChat?.();
                              if (onSwitchChat) {
                                onSwitchChat(chat.id);
                              } else {
                                router.push(`/chat/${chat.id}`);
                              }
                            }}
                            className="flex-1 truncate px-2 py-1.5 text-left"
                          >
                            {chat.title}
                          </button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="mr-1 hidden shrink-0 rounded p-1 text-muted-foreground/60 hover:bg-muted-foreground/10 hover:text-foreground group-hover:block"
                                aria-label="Chat options"
                              >
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom">
                              <DropdownMenuItem
                                className="cursor-pointer"
                                onSelect={() => startRename(chat)}
                              >
                                <Pencil className="mr-2 h-3.5 w-3.5" />
                                Rename
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="cursor-pointer text-destructive focus:bg-destructive/15 focus:text-destructive"
                                onSelect={() => setDeleteTarget(chat.id)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Infinite scroll trigger */}
          {!hasReachedEnd && (
            <motion.div
              className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground"
              onViewportEnter={() => {
                if (!isValidating && !hasReachedEnd) setSize((s) => s + 1);
              }}
            >
              <div className="animate-spin">
                <LoaderIcon />
              </div>
              Loading…
            </motion.div>
          )}

          {hasReachedEnd && allChats.length > PAGE_SIZE && (
            <div className="py-4 text-center text-xs text-muted-foreground/50">
              End of history
            </div>
          )}
        </div>
      )}

      {/* Quick chat input */}
      <div className={`shrink-0 border-t border-sidebar-border py-2 ${fullWidth ? "px-4 md:px-16 lg:px-64" : "px-3"}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const input = new FormData(form).get("prompt") as string;
            const trimmed = input?.trim();
            if (!trimmed) return;
            form.reset();
            onNavigateToChat?.();
            if (onSwitchChat) {
              onSwitchChat(null, trimmed);
            } else {
              router.push(`/?query=${encodeURIComponent(trimmed)}`);
            }
          }}
          className="flex items-center gap-2"
        >
          <input
            name="prompt"
            type="text"
            placeholder="Start a new chat..."
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60 focus:border-primary"
          />
          <button
            type="submit"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>

      {/* Delete single chat confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && handleDelete(deleteTarget)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete all confirmation */}
      <AlertDialog open={showDeleteAll} onOpenChange={setShowDeleteAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all chats?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all your conversations. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteAll}
            >
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export interface RightChatPanelProps {
  chatId: string;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  status: UseChatHelpers<ChatMessage>["status"];
  stop: UseChatHelpers<ChatMessage>["stop"];
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  sendMessage: UseChatHelpers<ChatMessage>["sendMessage"];
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  votes: Vote[] | undefined;
  isReadonly: boolean;
  isCurrentVersion: boolean;
  selectedVisibilityType: VisibilityType;
  selectedModelId: string;
  artifactStatus: UIArtifact["status"];
  addToolApprovalResponse: UseChatHelpers<ChatMessage>["addToolApprovalResponse"];
  /** When true, panel fills available space (two-panel mode). Collapse/resize disabled. */
  fullWidth?: boolean;
  panelWidth: number;
  onPanelWidthChange: (width: number) => void;
  onSwitchChat?: SwitchChatFn;
}

export function RightChatPanel({
  chatId,
  input,
  setInput,
  status,
  stop,
  attachments,
  setAttachments,
  messages,
  setMessages,
  sendMessage,
  regenerate,
  votes,
  isReadonly,
  isCurrentVersion,
  selectedVisibilityType,
  selectedModelId,
  artifactStatus,
  addToolApprovalResponse,
  fullWidth = false,
  panelWidth,
  onPanelWidthChange,
  onSwitchChat,
}: RightChatPanelProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>("active");
  const [hasUnread, setHasUnread] = useState(false);

  // Context-change markers
  const { addMarker, getMarkersAfter, clearMarkers } = useContextMarkers();
  const { current: currentArtifact } = useArtifactStack();
  const prevArtifactRef = useRef<string | null>(null);

  // Track artifact navigation and insert context markers
  useEffect(() => {
    const currentDocId = currentArtifact?.documentId ?? null;
    const prevDocId = prevArtifactRef.current;

    if (currentDocId !== prevDocId) {
      prevArtifactRef.current = currentDocId;

      // Only add marker if there are messages to anchor to
      const lastMessage = messages[messages.length - 1];
      if (lastMessage) {
        addMarker(
          lastMessage.id,
          currentArtifact?.title ?? null
        );
      }
    }
  }, [currentArtifact?.documentId, currentArtifact?.title, messages, addMarker]);

  // Notification badge: track new AI messages while collapsed
  const prevMessageCountRef = useRef(messages.length);
  useEffect(() => {
    if (isCollapsed && !fullWidth) {
      // Check if new messages arrived while collapsed
      if (messages.length > prevMessageCountRef.current) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg?.role === "assistant") {
          setHasUnread(true);
        }
      }
    } else {
      // Clear badge when expanded
      setHasUnread(false);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, messages, isCollapsed, fullWidth]);

  // Restore collapse state and tab from session storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsCollapsed(sessionStorage.getItem(SESSION_KEY) === "true");
      const savedTab = sessionStorage.getItem(TAB_KEY);
      if (savedTab === "active" || savedTab === "history") {
        setActiveTab(savedTab);
      }
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (!next) setHasUnread(false); // Clear badge when expanding
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_KEY, String(next));
    }
  };

  const switchTab = (tab: PanelTab) => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(TAB_KEY, tab);
    }
  };

  const width = isCollapsed && !fullWidth ? RIGHT_PANEL_ICON_WIDTH : panelWidth;

  // Shared content for both modes (tab bar + tab content)
  const panelContent = isCollapsed && !fullWidth ? (
    /* Icon rail — toggle at top, then tab icons */
    <div className="flex h-full flex-col items-center gap-3 pt-3">
      <button
        aria-label="Expand chat panel"
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
        onClick={toggleCollapsed}
        type="button"
      >
        <PanelRightOpen className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => { toggleCollapsed(); switchTab("active"); }}
        className="relative flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted-foreground/10 transition-colors"
        aria-label="Show active chat"
      >
        <MessageSquare className="h-4.5 w-4.5 text-muted-foreground" />
        {hasUnread && (
          <span className="absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
        )}
      </button>
      <button
        type="button"
        onClick={() => { toggleCollapsed(); switchTab("history"); }}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-muted-foreground/10 transition-colors"
        aria-label="Show chat history"
      >
        <History className="h-4.5 w-4.5 text-muted-foreground" />
      </button>
    </div>
  ) : (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Dim overlay when viewing a non-current version */}
      <AnimatePresence>
        {!isCurrentVersion && activeTab === "active" && (
          <motion.div
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-50 bg-zinc-900/50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>

      {/* Resize handle on the left edge — only in sidebar mode */}
      {!fullWidth && (
        <div
          className="absolute top-0 left-0 h-full w-1 cursor-col-resize select-none hover:bg-sidebar-border z-20"
          onMouseDown={(e) => {
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = panelWidth;

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const delta = startX - moveEvent.clientX;
              const newWidth = Math.min(
                SIDEBAR_WIDTH_MAX,
                Math.max(SIDEBAR_WIDTH_MIN, startWidth + delta)
              );
              onPanelWidthChange(newWidth);
            };

            const handleMouseUp = () => {
              document.removeEventListener("mousemove", handleMouseMove);
              document.removeEventListener("mouseup", handleMouseUp);
              document.body.style.cursor = "";
              document.body.style.userSelect = "";
            };

            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
            document.addEventListener("mousemove", handleMouseMove);
            document.addEventListener("mouseup", handleMouseUp);
          }}
        />
      )}

      {/* Tab bar */}
      <div className={`flex shrink-0 items-center border-b border-sidebar-border ${fullWidth ? "px-4 md:px-16 lg:px-64" : ""}`}>
        {!fullWidth && (
          <button
            aria-label="Collapse chat panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors ml-2"
            onClick={toggleCollapsed}
            type="button"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={() => switchTab("active")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "active"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Active
        </button>
        <button
          type="button"
          onClick={() => switchTab("history")}
          className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === "history"
              ? "border-b-2 border-primary text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-3.5 w-3.5" />
          History
        </button>
      </div>

      {/* Tab content */}
      {activeTab === "active" ? (
        <>
          <ArtifactMessages
            addToolApprovalResponse={addToolApprovalResponse}
            artifactStatus={artifactStatus}
            chatId={chatId}
            className={fullWidth ? "mx-auto w-full md:px-16 lg:px-64" : undefined}
            getMarkersAfter={getMarkersAfter}
            isReadonly={isReadonly}
            messages={messages}
            regenerate={regenerate}
            setMessages={setMessages}
            status={status}
            votes={votes}
          />

          {!isReadonly && (
            <div className={fullWidth
              ? "relative mx-auto flex w-full flex-col gap-0 px-4 pb-4 pt-2 md:px-16 lg:px-64"
              : "relative flex w-full flex-col gap-0 px-4 pb-4 pt-2"
            }>
              {/* Context indicator chip */}
              {currentArtifact && (
                <div className="flex items-center justify-center pb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                    <Eye className="h-3 w-3" />
                    Viewing: {currentArtifact.title}
                  </span>
                </div>
              )}
              <div className="flex flex-row items-end gap-2">
              <MultimodalInput
                attachments={attachments}
                chatId={chatId}
                className="bg-background dark:bg-muted"
                input={input}
                messages={messages}
                selectedModelId={selectedModelId}
                selectedVisibilityType={selectedVisibilityType}
                sendMessage={sendMessage}
                setAttachments={setAttachments}
                setInput={setInput}
                setMessages={setMessages}
                status={status}
                stop={stop}
              />
              </div>
            </div>
          )}
        </>
      ) : (
        <PanelChatHistory
          activeChatId={chatId}
          fullWidth={fullWidth}
          onNavigateToChat={() => switchTab("active")}
          onSwitchChat={onSwitchChat}
        />
      )}
    </div>
  );

  return (
    <div
      aria-label="Chat panel"
      className={
        fullWidth
          ? "relative flex h-full min-w-0 flex-1 flex-col border-l border-sidebar-border bg-background transition-[flex,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          : "relative flex h-full shrink-0 flex-col border-l border-sidebar-border bg-background transition-[flex,width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      }
      style={fullWidth ? undefined : { width }}
    >
      {panelContent}
    </div>
  );
}
