"use client";

import type { UseChatHelpers } from "@ai-sdk/react";
import { MessageSquare, PanelRightClose, PanelRightOpen } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { Vote } from "@/lib/db/schema";
import type { Attachment, ChatMessage } from "@/lib/types";
import { ArtifactMessages } from "./artifact-messages";
import { MultimodalInput } from "./multimodal-input";
import type { UIArtifact } from "./artifact";
import type { VisibilityType } from "./visibility-selector";
import { SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX } from "./ui/sidebar";

const RIGHT_PANEL_DEFAULT_WIDTH = 360;
const RIGHT_PANEL_ICON_WIDTH = 48;
const SESSION_KEY = "right-panel-collapsed";

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
  panelWidth: number;
  onPanelWidthChange: (width: number) => void;
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
  panelWidth,
  onPanelWidthChange,
}: RightChatPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Restore collapse state from session storage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsCollapsed(sessionStorage.getItem(SESSION_KEY) === "true");
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(SESSION_KEY, String(next));
    }
  };

  const width = isCollapsed ? RIGHT_PANEL_ICON_WIDTH : panelWidth;

  return (
    <motion.aside
      animate={{ width }}
      aria-label="Chat panel"
      className="relative flex h-full shrink-0 flex-col border-l border-sidebar-border bg-muted dark:bg-background"
      initial={false}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      {/* Collapse/expand toggle on the left edge, aligned with the icon rail icon */}
      <button
        aria-label={isCollapsed ? "Expand chat panel" : "Collapse chat panel"}
        className="absolute top-14 -left-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-sidebar-border bg-background shadow-sm hover:bg-muted transition-colors"
        onClick={toggleCollapsed}
        type="button"
      >
        {isCollapsed ? (
          <PanelRightOpen className="h-3 w-3" />
        ) : (
          <PanelRightClose className="h-3 w-3" />
        )}
      </button>

      {isCollapsed ? (
        /* Icon rail */
        <div className="flex h-full flex-col items-center gap-2 pt-14">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
        </div>
      ) : (
        /* Expanded panel */
        <div className="relative flex h-full flex-col overflow-hidden">
          {/* Dim overlay when viewing a non-current version */}
          <AnimatePresence>
            {!isCurrentVersion && (
              <motion.div
                animate={{ opacity: 1 }}
                className="absolute inset-0 z-50 bg-zinc-900/50"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
              />
            )}
          </AnimatePresence>

          {/* Resize handle on the left edge */}
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

          <ArtifactMessages
            addToolApprovalResponse={addToolApprovalResponse}
            artifactStatus={artifactStatus}
            chatId={chatId}
            isReadonly={isReadonly}
            messages={messages}
            regenerate={regenerate}
            setMessages={setMessages}
            status={status}
            votes={votes}
          />

          {!isReadonly && (
            <div className="relative flex w-full flex-row items-end gap-2 px-4 pb-4">
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
          )}
        </div>
      )}
    </motion.aside>
  );
}
